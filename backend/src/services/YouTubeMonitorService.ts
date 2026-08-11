import mongoose from 'mongoose';
import Conversation from '../models/Conversation';
import InboundEvent from '../models/InboundEvent';
import OutboundMessage from '../models/OutboundMessage';
import YouTubeCredential from '../models/YouTubeCredential';

export class YouTubeMonitorService {
  static getConfig() {
    return {
      activeDays: Math.max(1, Number(process.env.YOUTUBE_REPLY_ACTIVE_DAYS || 7)),
      maxThreads: Math.max(8, Number(process.env.YOUTUBE_REPLY_MAX_THREADS || 8)),
      intervalMs: Math.max(60000, Number(process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS || 120000)),
      dailyQuota: Math.max(1, Number(process.env.YOUTUBE_DAILY_QUOTA || 10000)),
      responseAlertMinutes: Math.max(2, Number(process.env.YOUTUBE_RESPONSE_ALERT_MINUTES || 10)),
    };
  }

  static async getForUser(userId: string) {
    const config = this.getConfig();
    const since = new Date(Date.now() - config.activeDays * 86400000);
    const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
    const objectUserId = new mongoose.Types.ObjectId(userId);
    const [credential, outbound, delivery, failed, lastInbound, conversations]: any[] = await Promise.all([
      YouTubeCredential.findOne({ userId }).select('channelTitle lastPolledAt lastRepliesPolledAt lastReplyPollingSummary').lean(),
      OutboundMessage.find({ userId, channel: 'youtube', messageType: 'youtube_reply', recipientId: { $exists: true }, createdAt: { $gte: since } })
        .sort({ createdAt: -1 }).limit(200).select('recipientId leadId conversationId deliveryStatus createdAt sentAt').populate('leadId', 'fullName status interestLevel score').populate('conversationId', 'status lastMessage').lean(),
      OutboundMessage.aggregate([
        { $match: { userId: objectUserId, channel: 'youtube', createdAt: { $gte: dayStart } } },
        { $group: { _id: '$deliveryStatus', count: { $sum: 1 } } },
      ]),
      OutboundMessage.find({ userId, channel: 'youtube', deliveryStatus: 'failed', createdAt: { $gte: since } })
        .sort({ failedAt: -1 }).limit(10).select('errorCode failedAt retryCount lastRetryAt').lean(),
      InboundEvent.findOne({ userId, channel: 'youtube' }).sort({ processedAt: -1 }).select('processedAt').lean(),
      Conversation.find({ userId, status: 'active', lastMessage: { $gte: since } }).sort({ lastMessage: -1 }).slice('messages', -1).select('lastMessage messages').lean(),
    ]);

    const unique = new Map<string, any>();
    for (const item of outbound) if (!unique.has(item.recipientId)) unique.set(item.recipientId, item);
    const threads = [...unique.values()];
    const monitored = threads.slice(0, config.maxThreads);
    const deliveryCounts = Object.fromEntries(delivery.map((item: any) => [item._id, item.count]));
    const unanswered = conversations.filter((conversation: any) => conversation.messages?.[0]?.sender === 'lead'
      && Date.now() - new Date(conversation.lastMessage).getTime() > config.responseAlertMinutes * 60000);
    const sentCount = Number(deliveryCounts.sent || 0);
    const estimatedQuotaUnits = sentCount * 50;
    const errorSummary = this.summarizeErrors(failed);

    return {
      checkedAt: new Date(), connected: Boolean(credential), channelTitle: credential?.channelTitle,
      lastPolledAt: credential?.lastPolledAt, lastRepliesPolledAt: credential?.lastRepliesPolledAt,
      config, activeThreadCount: threads.length, monitoredThreadCount: monitored.length,
      uncoveredThreadCount: Math.max(0, threads.length - monitored.length),
      lastProcessedCommentAt: lastInbound?.processedAt,
      delivery: { sent: sentCount, failed: Number(deliveryCounts.failed || 0), pending: Number(deliveryCounts.pending || 0), simulated: Number(deliveryCounts.simulated || 0) },
      quota: { estimatedUnitsToday: estimatedQuotaUnits, dailyLimit: config.dailyQuota, estimatedPercent: Math.min(100, Math.round(estimatedQuotaUnits / config.dailyQuota * 100)), note: 'Estimación mínima basada en respuestas publicadas; Google Cloud es la fuente definitiva.' },
      unanswered: { count: unanswered.length, oldestAt: unanswered.length ? unanswered[unanswered.length - 1].lastMessage : undefined },
      errors: errorSummary,
      retryableFailures: failed.map((item: any) => ({ id: item._id, category: this.errorCategory(item.errorCode), code: item.errorCode || 'UNKNOWN', failedAt: item.failedAt, retryCount: item.retryCount || 0, canRetry: !['YOUTUBE_TIMEOUT', 'MESSAGING_UNKNOWN_ERROR', 'YOUTUBE_UNKNOWN_ERROR'].includes(item.errorCode || '') && Number(item.retryCount || 0) < 3 })),
      lastReplySummary: credential?.lastReplyPollingSummary,
      threads: threads.slice(0, 30).map((item, index) => ({
        position: index + 1, monitored: index < config.maxThreads,
        lead: item.leadId ? { name: item.leadId.fullName || 'Prospecto de YouTube', status: item.leadId.status, interestLevel: item.leadId.interestLevel, score: item.leadId.score } : null,
        conversationStatus: item.conversationId?.status,
        lastActivityAt: item.conversationId?.lastMessage || item.sentAt || item.createdAt,
        deliveryStatus: item.deliveryStatus,
      })),
      alerts: this.buildAlerts(threads.length, config.maxThreads, credential?.lastRepliesPolledAt, unanswered.length, errorSummary.quota),
    };
  }

  static errorCategory(code?: string): 'oauth' | 'quota' | 'network' | 'api' {
    const value = (code || '').toLowerCase();
    if (value.includes('quota') || value.includes('ratelimit') || value.includes('dailylimit')) return 'quota';
    if (value.includes('auth') || value.includes('token') || value === '401' || value === '403') return 'oauth';
    if (value.includes('timeout') || value.includes('network') || value.includes('econn')) return 'network';
    return 'api';
  }

  static summarizeErrors(failed: Array<{ errorCode?: string }>) {
    const summary = { oauth: 0, quota: 0, network: 0, api: 0 };
    for (const item of failed) summary[this.errorCategory(item.errorCode)] += 1;
    return summary;
  }

  static buildAlerts(activeThreads: number, maxThreads: number, lastRepliesPolledAt?: Date, unanswered = 0, quotaErrors = 0) {
    const alerts: Array<{ severity: 'healthy' | 'warning' | 'error'; code: string; message: string }> = [];
    if (!lastRepliesPolledAt || Date.now() - new Date(lastRepliesPolledAt).getTime() > 360000) alerts.push({ severity: 'error', code: 'reply_poller_stale', message: 'El monitor de respuestas lleva más de seis minutos sin actualizarse.' });
    else alerts.push({ severity: 'healthy', code: 'reply_poller_healthy', message: 'El monitor de respuestas está activo.' });
    if (activeThreads > maxThreads) alerts.push({ severity: 'warning', code: 'thread_capacity', message: `${activeThreads - maxThreads} hilos activos están fuera de la cobertura inmediata.` });
    else alerts.push({ severity: 'healthy', code: 'thread_capacity_ok', message: 'Todos los hilos activos están cubiertos.' });
    if (unanswered > 0) alerts.push({ severity: 'error', code: 'alma_unanswered', message: `${unanswered} conversaciones llevan más tiempo del permitido esperando respuesta de ALMA.` });
    if (quotaErrors > 0) alerts.push({ severity: 'error', code: 'youtube_quota', message: 'YouTube rechazó al menos una operación por cuota; revisa Google Cloud antes de reintentar.' });
    return alerts;
  }
}
