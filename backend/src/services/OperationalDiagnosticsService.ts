import Meeting from '../models/Meeting';
import InboundEvent from '../models/InboundEvent';
import YouTubeCredential from '../models/YouTubeCredential';
import { ReadinessService } from './ReadinessService';
import { Types } from 'mongoose';

type Severity = 'healthy' | 'info' | 'warning' | 'error';
type DiagnosticAlert = { severity: Severity; code: string; message: string };

export class OperationalDiagnosticsService {
  static async getForUser(userId: string) {
    const now = new Date();
    const credential: any = await YouTubeCredential.findOne({ userId }).select(
      'channelId channelTitle channelHandle authorizedChannelId authorizedChannelTitle authorizedChannelHandle connectedAt lastPolledAt lastRepliesPolledAt lastPollingSummary lastPollingFailure lastReplyPollingSummary',
    ).lean();
    const [pendingBooking, futureScheduled, expiredScheduled, failedMeetings, latestCalendly, readiness, latestInbound] = await Promise.all([
      Meeting.countDocuments({ userId, status: 'pending_booking' }),
      Meeting.countDocuments({ userId, status: 'scheduled', scheduledFor: { $gt: now } }),
      Meeting.countDocuments({ userId, status: 'scheduled', scheduledFor: { $lte: now } }),
      Meeting.countDocuments({ userId, status: 'failed' }),
      Meeting.findOne({ userId, provider: 'calendly', status: 'scheduled' }).sort({ updatedAt: -1 }).select('scheduledFor updatedAt').lean(),
      ReadinessService.inspect(),
      InboundEvent.aggregate([
        { $match: { userId: new Types.ObjectId(userId) } },
        { $sort: { eventTimestamp: -1, createdAt: -1 } },
        { $group: { _id: '$channel', lastActivityAt: { $first: { $ifNull: ['$eventTimestamp', '$createdAt'] } } } },
      ]),
    ]);
    const youtube = {
      connected: Boolean(credential),
      channelTitle: credential?.channelTitle,
      channelId: credential?.channelId,
      channelHandle: credential?.channelHandle,
      authorizedChannelId: credential?.authorizedChannelId || credential?.channelId,
      authorizedChannelTitle: credential?.authorizedChannelTitle || credential?.channelTitle,
      lastPolledAt: credential?.lastPolledAt,
      lastRepliesPolledAt: credential?.lastRepliesPolledAt,
      polling: credential?.lastPollingSummary,
      pollingFailure: credential?.lastPollingFailure,
      replies: credential?.lastReplyPollingSummary,
    };
    const meetings = { pendingBooking, futureScheduled, expiredScheduled, failed: failedMeetings, latestCalendly };
    const inboundActivity = Object.fromEntries(latestInbound.map((item: any) => [item._id, item.lastActivityAt]));
    const providers: any = readiness.runtime.providers;
    const channel = (key: string, label: string) => {
      const provider = providers[key] || {};
      const inbound = provider.inbound === true || provider.inbound === 'live' ? 'live' : provider.inbound === 'disabled' ? 'disabled' : 'disabled';
      return {
        key,
        label,
        connected: Boolean(provider.configured && (inbound === 'live' || provider.outbound === 'live')),
        mode: provider.outbound === 'live' || inbound === 'live' ? 'live' : provider.configured ? 'mock' : 'disabled',
        inbound,
        outbound: provider.outbound === 'live' ? 'live' : provider.outbound === 'mock' ? 'mock' : 'disabled',
        automatic: Boolean(provider.automatic),
        lastActivityAt: inboundActivity[key],
      };
    };
    const integrations = [
      channel('whatsapp', 'WhatsApp'),
      channel('instagram', 'Instagram'),
      channel('facebook', 'Facebook'),
      { ...channel('youtube', 'YouTube'), connected: Boolean(credential), lastActivityAt: credential?.lastRepliesPolledAt || credential?.lastPolledAt },
      channel('tiktok', 'TikTok'),
      {
        key: 'calendly', label: 'Calendly',
        connected: Boolean(process.env.CALENDLY_PERSONAL_ACCESS_TOKEN && process.env.CALENDLY_BOOKING_URL),
        mode: process.env.SCHEDULING_MODE === 'calendly' ? 'live' : 'disabled',
        inbound: process.env.SCHEDULING_MODE === 'calendly' ? 'live' : 'disabled',
        outbound: 'disabled', automatic: false, lastActivityAt: latestCalendly?.updatedAt,
      },
    ];
    return {
      checkedAt: now,
      integrations,
      youtube,
      calendly: {
        configured: Boolean(process.env.CALENDLY_PERSONAL_ACCESS_TOKEN && process.env.CALENDLY_BOOKING_URL),
        schedulingMode: process.env.SCHEDULING_MODE || 'zoom',
        ...meetings,
      },
      alerts: this.buildAlerts({ now, youtube, meetings }),
    };
  }

  static buildAlerts(input: { now: Date; youtube: any; meetings: { pendingBooking: number; futureScheduled: number; expiredScheduled: number; failed: number } }): DiagnosticAlert[] {
    const alerts: DiagnosticAlert[] = [];
    if (!input.youtube.connected) alerts.push({ severity: 'error', code: 'youtube_disconnected', message: 'YouTube no está conectado.' });
    else if (input.youtube.pollingFailure?.operation === 'oauth_refresh') alerts.push({
      severity: 'error', code: 'youtube_reconnect_required',
      message: 'La autorización de YouTube dejó de ser válida; vuelve a conectar el canal.',
    });
    else if (input.youtube.pollingFailure) alerts.push({
      severity: 'error', code: 'youtube_poll_failed',
      message: `YouTube rechazó el sondeo (${input.youtube.pollingFailure.reason || 'api_error'}).`,
    });
    else if (!input.youtube.lastPolledAt) alerts.push({ severity: 'warning', code: 'youtube_never_polled', message: 'YouTube está conectado, pero aún no registra un sondeo.' });
    else if (input.now.getTime() - new Date(input.youtube.lastPolledAt).getTime() > 5 * 60 * 1000) alerts.push({ severity: 'error', code: 'youtube_poll_stale', message: 'El sondeo de YouTube lleva más de cinco minutos sin actualizarse.' });
    else alerts.push({ severity: 'healthy', code: 'youtube_healthy', message: 'YouTube está conectado y el sondeo está activo.' });
    if (Number(input.youtube.replies?.not_eligible || 0) > 0) alerts.push({ severity: 'warning', code: 'youtube_identity_mismatch', message: 'Se detectaron respuestas desde canales que no iniciaron la conversación.' });
    if (input.meetings.pendingBooking > 0) alerts.push({ severity: 'info', code: 'booking_pending', message: 'Hay reservas de Calendly pendientes de completar.' });
    if (input.meetings.futureScheduled > 0) alerts.push({ severity: 'healthy', code: 'meeting_scheduled', message: 'Hay al menos una reunión futura programada.' });
    if (input.meetings.failed > 0) alerts.push({ severity: 'error', code: 'meeting_failed', message: 'Hay reuniones con errores que requieren revisión.' });
    if (input.meetings.expiredScheduled > 0) alerts.push({ severity: 'info', code: 'meeting_history', message: 'Las reuniones vencidas se conservan como historial y no bloquean nuevas reservas.' });
    return alerts;
  }
}
