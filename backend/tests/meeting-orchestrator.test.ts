import { MeetingOrchestratorService } from '../src/services/MeetingOrchestratorService';
import Meeting from '../src/models/Meeting';

describe('MeetingOrchestratorService detail extraction', () => {
  const originalCalendlyUrl = process.env.CALENDLY_BOOKING_URL;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCalendlyUrl === undefined) delete process.env.CALENDLY_BOOKING_URL;
    else process.env.CALENDLY_BOOKING_URL = originalCalendlyUrl;
  });

  test('extracts email, Latin date, 12-hour time and city timezone', () => {
    expect(MeetingOrchestratorService.extractDetails('Escribe a Ana.Test+alma@example.com el 20/08/2027 a las 3:30 pm en Bogotá')).toEqual({
      email: 'ana.test+alma@example.com', date: '2027-08-20', time: '15:30', timezone: 'America/Bogota',
    });
  });

  test('extracts ISO date, 24-hour time and IANA timezone', () => {
    expect(MeetingOrchestratorService.extractDetails('2027-09-15 09:05 America/Mexico_City')).toEqual({
      email: undefined, date: '2027-09-15', time: '09:05', timezone: 'America/Mexico_City',
    });
  });

  test('does not treat arbitrary text as meeting details', () => {
    expect(MeetingOrchestratorService.extractDetails('Me interesa conocer más')).toEqual({ email: undefined, date: undefined, time: undefined, timezone: undefined });
  });

  test('uses the YouTube lead identifier instead of requesting email publicly', () => {
    expect(MeetingOrchestratorService.getContactIdentifier('youtube', 'lead-123')).toBe('youtube:lead-123');
  });

  test('only treats future scheduled meetings as active', () => {
    const now = new Date('2026-08-10T22:00:00.000Z');
    expect(MeetingOrchestratorService.activeScheduledMeetingFilter('conversation-1', now)).toEqual({
      conversationId: 'conversation-1', status: 'scheduled', scheduledFor: { $gt: now },
    });
  });

  test('attributes a Calendly link to the current conversation channel', () => {
    process.env.CALENDLY_BOOKING_URL = 'https://calendly.com/example/discovery?utm_source=youtube';
    const booking = (MeetingOrchestratorService as any).buildCalendlyBookingUrl('whatsapp');
    const url = new URL(booking.url);
    expect(url.searchParams.get('utm_source')).toBe('whatsapp');
    expect(url.searchParams.get('utm_medium')).toBe('alma');
    expect(booking.token).toMatch(/^[a-f0-9]{48}$/);
  });

  test('continues an existing meeting naturally when the contact repeats INFO', () => {
    expect(MeetingOrchestratorService.repeatedInfoMeetingReply({
      status: 'pending_booking',
      bookingUrl: 'https://calendly.com/example/existing',
    })).toBe('Ya tienes una reunión pendiente de reserva. Puedes retomar el horario cuando quieras desde tu enlace: https://calendly.com/example/existing');
    expect(MeetingOrchestratorService.repeatedInfoMeetingReply({ status: 'confirmed' }))
      .toMatch(/ya tienes una reunión confirmada.+no crearé otra invitación/i);
    expect(MeetingOrchestratorService.repeatedInfoMeetingReply({ status: 'pending_details' }))
      .toMatch(/solicitud de reunión en curso.+sin crear otra invitación/i);
  });

  test('handles repeated INFO from the persisted meeting before offering or creating another one', async () => {
    const sort = jest.fn().mockResolvedValue({ status: 'confirmed' });
    const findOne = jest.spyOn(Meeting, 'findOne').mockReturnValue({ sort } as any);

    const result = await MeetingOrchestratorService.process({
      userId: 'owner-1', leadId: 'lead-1', conversationId: 'conversation-1',
      sourceEventId: 'wamid.repeat-info', text: 'INFO', wantsMeeting: false, platform: 'whatsapp',
    });

    expect(result).toMatchObject({ handled: true });
    expect(result.reply).toMatch(/ya tienes una reunión confirmada.+no crearé otra invitación/i);
    expect(findOne).toHaveBeenCalledTimes(1);
  });
});
