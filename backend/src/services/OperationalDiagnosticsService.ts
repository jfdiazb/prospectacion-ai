import Meeting from '../models/Meeting';
import YouTubeCredential from '../models/YouTubeCredential';

type Severity = 'healthy' | 'info' | 'warning' | 'error';
type DiagnosticAlert = { severity: Severity; code: string; message: string };

export class OperationalDiagnosticsService {
  static async getForUser(userId: string) {
    const now = new Date();
    const credential: any = await YouTubeCredential.findOne({ userId }).select(
      'channelId channelTitle channelHandle authorizedChannelId authorizedChannelTitle authorizedChannelHandle connectedAt lastPolledAt lastRepliesPolledAt lastPollingSummary lastPollingFailure lastReplyPollingSummary',
    ).lean();
    const [pendingBooking, futureScheduled, expiredScheduled, failedMeetings, latestCalendly] = await Promise.all([
      Meeting.countDocuments({ userId, status: 'pending_booking' }),
      Meeting.countDocuments({ userId, status: 'scheduled', scheduledFor: { $gt: now } }),
      Meeting.countDocuments({ userId, status: 'scheduled', scheduledFor: { $lte: now } }),
      Meeting.countDocuments({ userId, status: 'failed' }),
      Meeting.findOne({ userId, provider: 'calendly', status: 'scheduled' }).sort({ updatedAt: -1 }).select('scheduledFor updatedAt').lean(),
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
    return {
      checkedAt: now,
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
