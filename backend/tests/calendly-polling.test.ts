import { CalendlyPollingService } from '../src/services/CalendlyPollingService';

describe('CalendlyPollingService', () => {
  const originalToken = process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;

  afterEach(() => {
    process.env.CALENDLY_PERSONAL_ACCESS_TOKEN = originalToken;
    jest.restoreAllMocks();
  });

  test('matches UTM tokens and prefers an active rescheduled invitee', async () => {
    process.env.CALENDLY_PERSONAL_ACCESS_TOKEN = 'private-token';
    const get = jest.fn()
      .mockResolvedValueOnce({ data: { resource: { uri: 'https://api.calendly.com/users/user-1' } } })
      .mockResolvedValueOnce({ data: { collection: [
        { uri: 'https://api.calendly.com/scheduled_events/old', status: 'active', start_time: '2027-01-02T00:30:00Z' },
        { uri: 'https://api.calendly.com/scheduled_events/new', status: 'active', start_time: '2027-01-03T00:30:00Z' },
      ], pagination: {} } })
      .mockResolvedValueOnce({ data: { collection: [{ uri: 'invitee-old', status: 'canceled', tracking: { utm_content: 'booking-1' } }], pagination: {} } })
      .mockResolvedValueOnce({ data: { collection: [{ uri: 'invitee-new', status: 'active', tracking: { utm_content: 'booking-1' } }], pagination: {} } });
    const apply = jest.spyOn(CalendlyPollingService, 'applySnapshot').mockResolvedValue();

    await new CalendlyPollingService({ get } as any).poll();

    expect(get).toHaveBeenCalledTimes(4);
    expect(get.mock.calls[1][0]).toContain('user=https%3A%2F%2Fapi.calendly.com%2Fusers%2Fuser-1');
    expect(apply).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledWith('booking-1', expect.objectContaining({
      cancelled: false,
      event: expect.objectContaining({ uri: 'https://api.calendly.com/scheduled_events/new' }),
    }));
  });

  test('does nothing without a configured personal token', async () => {
    delete process.env.CALENDLY_PERSONAL_ACCESS_TOKEN;
    const get = jest.fn();
    await new CalendlyPollingService({ get } as any).poll();
    expect(get).not.toHaveBeenCalled();
  });
});
