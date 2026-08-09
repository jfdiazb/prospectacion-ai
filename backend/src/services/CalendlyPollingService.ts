import axios, { type AxiosInstance } from 'axios';
import Meeting from '../models/Meeting';
import Activity from '../models/Activity';
import Task from '../models/Task';

type CalendlyEvent = {
  uri: string;
  start_time?: string;
  status?: string;
  location?: { join_url?: string };
};

type CalendlyInvitee = {
  uri?: string;
  email?: string;
  timezone?: string;
  status?: string;
  tracking?: { utm_content?: string | null };
};

type CalendlyCollection<T> = {
  collection?: T[];
  pagination?: { next_page_token?: string | null };
};

type BookingSnapshot = { event: CalendlyEvent; invitee: CalendlyInvitee; cancelled: boolean };

export class CalendlyPollingService {
  private running = false;

  constructor(private readonly http: AxiosInstance = axios) {}

  async poll(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const token = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN?.trim();
      if (!token) return;
      const config = { headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.CALENDLY_TIMEOUT_MS || 10000) };
      const me = await this.http.get<{ resource?: { uri?: string } }>('https://api.calendly.com/users/me', config);
      const user = me.data.resource?.uri;
      if (!user) throw new Error('Calendly no devolvió el URI del usuario');

      const snapshots = new Map<string, BookingSnapshot>();
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          user,
          count: '100',
          min_start_time: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          max_start_time: new Date(Date.now() + Number(process.env.CALENDLY_LOOKAHEAD_DAYS || 90) * 24 * 60 * 60 * 1000).toISOString(),
        });
        if (pageToken) params.set('page_token', pageToken);
        const eventsResponse = await this.http.get<CalendlyCollection<CalendlyEvent>>(`https://api.calendly.com/scheduled_events?${params}`, config);
        for (const event of eventsResponse.data.collection ?? []) await this.collectInvitees(event, config, snapshots);
        pageToken = eventsResponse.data.pagination?.next_page_token || undefined;
      } while (pageToken);

      for (const [bookingToken, snapshot] of snapshots) await CalendlyPollingService.applySnapshot(bookingToken, snapshot);
    } finally {
      this.running = false;
    }
  }

  private async collectInvitees(event: CalendlyEvent, config: object, snapshots: Map<string, BookingSnapshot>): Promise<void> {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ count: '100' });
      if (pageToken) params.set('page_token', pageToken);
      const response = await this.http.get<CalendlyCollection<CalendlyInvitee>>(`${event.uri}/invitees?${params}`, config);
      for (const invitee of response.data.collection ?? []) {
        const bookingToken = invitee.tracking?.utm_content?.trim();
        if (!bookingToken) continue;
        const candidate = { event, invitee, cancelled: event.status === 'canceled' || invitee.status === 'canceled' };
        const previous = snapshots.get(bookingToken);
        if (!previous || (previous.cancelled && !candidate.cancelled)) snapshots.set(bookingToken, candidate);
      }
      pageToken = response.data.pagination?.next_page_token || undefined;
    } while (pageToken);
  }

  static async applySnapshot(bookingToken: string, snapshot: BookingSnapshot): Promise<void> {
    const meeting = await Meeting.findOne({ provider: 'calendly', bookingToken });
    if (!meeting) return;
    if (snapshot.cancelled) {
      const changed = meeting.status !== 'cancelled';
      meeting.status = 'cancelled';
      await meeting.save();
      await Task.updateMany({ 'metadata.meetingId': meeting._id.toString(), status: 'pending' }, { $set: { status: 'cancelled' } });
      if (changed) await Activity.create({ userId: meeting.userId, leadId: meeting.leadId, conversationId: meeting.conversationId,
        type: 'meeting_requested', description: 'El prospecto canceló la reserva en Calendly', metadata: { meetingId: meeting._id } });
      return;
    }

    const changed = meeting.status !== 'scheduled';
    meeting.status = 'scheduled';
    meeting.attendeeEmail = snapshot.invitee.email;
    meeting.timezone = snapshot.invitee.timezone;
    meeting.inviteeUri = snapshot.invitee.uri;
    meeting.externalId = snapshot.event.uri;
    meeting.joinUrl = snapshot.event.location?.join_url;
    if (snapshot.event.start_time) meeting.scheduledFor = new Date(snapshot.event.start_time);
    await meeting.save();
    await Task.updateMany({ 'metadata.meetingId': meeting._id.toString(), status: 'pending' }, {
      $set: { title: 'Preparar reunión de descubrimiento', description: 'Reserva confirmada por Calendly.', dueDate: meeting.scheduledFor },
    });
    if (changed) await Activity.create({ userId: meeting.userId, leadId: meeting.leadId, conversationId: meeting.conversationId,
      type: 'meeting_created', description: 'Reunión reservada mediante Calendly', metadata: { meetingId: meeting._id, scheduledFor: meeting.scheduledFor } });
  }
}

let timer: NodeJS.Timeout | undefined;
export const startCalendlyPolling = (): void => {
  if ((process.env.SCHEDULING_MODE || 'zoom') !== 'calendly' || !process.env.CALENDLY_PERSONAL_ACCESS_TOKEN?.trim() || timer) return;
  const service = new CalendlyPollingService();
  const run = () => void service.poll().catch(error => console.error('Calendly polling error', {
    message: error instanceof Error ? error.message : 'unknown',
  }));
  run();
  timer = setInterval(run, Math.max(60000, Number(process.env.CALENDLY_POLL_INTERVAL_MS || 120000)));
  timer.unref();
};
