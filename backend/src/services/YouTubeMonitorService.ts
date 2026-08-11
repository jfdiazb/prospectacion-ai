import OutboundMessage from '../models/OutboundMessage';
import YouTubeCredential from '../models/YouTubeCredential';

export class YouTubeMonitorService {
  static getConfig() {
    return {
      activeDays: Math.max(1, Number(process.env.YOUTUBE_REPLY_ACTIVE_DAYS || 7)),
      maxThreads: Math.max(1, Number(process.env.YOUTUBE_REPLY_MAX_THREADS || 8)),
      intervalMs: Math.max(60000, Number(process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS || 120000)),
    };
  }

  static async getForUser(userId: string) {
    const config = this.getConfig();
    const since = new Date(Date.now() - config.activeDays * 24 * 60 * 60 * 1000);
    const [credential, outbound]: any[] = await Promise.all([
      YouTubeCredential.findOne({ userId }).select('channelTitle lastPolledAt lastRepliesPolledAt lastReplyPollingSummary').lean(),
      OutboundMessage.find({ userId, channel: 'youtube', messageType: 'youtube_reply', recipientId: { $exists: true }, createdAt: { $gte: since } })
        .sort({ createdAt: -1 }).limit(200).select('recipientId leadId conversationId deliveryStatus createdAt sentAt').populate('leadId', 'fullName status interestLevel score').populate('conversationId', 'status lastMessage').lean(),
    ]);
    const unique = new Map<string, any>();
    for (const item of outbound) if (!unique.has(item.recipientId)) unique.set(item.recipientId, item);
    const threads = [...unique.values()];
    const monitored = threads.slice(0, config.maxThreads);
    return {
      checkedAt: new Date(), connected: Boolean(credential), channelTitle: credential?.channelTitle,
      lastPolledAt: credential?.lastPolledAt, lastRepliesPolledAt: credential?.lastRepliesPolledAt,
      config, activeThreadCount: threads.length, monitoredThreadCount: monitored.length,
      uncoveredThreadCount: Math.max(0, threads.length - monitored.length),
      lastReplySummary: credential?.lastReplyPollingSummary,
      threads: threads.slice(0, 30).map((item, index) => ({
        position: index + 1, monitored: index < config.maxThreads,
        lead: item.leadId ? { name: item.leadId.fullName || 'Prospecto de YouTube', status: item.leadId.status, interestLevel: item.leadId.interestLevel, score: item.leadId.score } : null,
        conversationStatus: item.conversationId?.status,
        lastActivityAt: item.conversationId?.lastMessage || item.sentAt || item.createdAt,
        deliveryStatus: item.deliveryStatus,
      })),
      alerts: this.buildAlerts(threads.length, config.maxThreads, credential?.lastRepliesPolledAt),
    };
  }

  static buildAlerts(activeThreads: number, maxThreads: number, lastRepliesPolledAt?: Date) {
    const alerts: Array<{ severity: 'healthy' | 'warning' | 'error'; code: string; message: string }> = [];
    if (!lastRepliesPolledAt || Date.now() - new Date(lastRepliesPolledAt).getTime() > 6 * 60 * 1000) alerts.push({ severity: 'error', code: 'reply_poller_stale', message: 'El monitor de respuestas lleva más de seis minutos sin actualizarse.' });
    else alerts.push({ severity: 'healthy', code: 'reply_poller_healthy', message: 'El monitor de respuestas está activo.' });
    if (activeThreads > maxThreads) alerts.push({ severity: 'warning', code: 'thread_capacity', message: `${activeThreads - maxThreads} hilos activos están fuera de la cobertura inmediata.` });
    else alerts.push({ severity: 'healthy', code: 'thread_capacity_ok', message: 'Todos los hilos activos están cubiertos.' });
    return alerts;
  }
}
