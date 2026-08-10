import { OperationalDiagnosticsService } from '../src/services/OperationalDiagnosticsService';

describe('OperationalDiagnosticsService alerts', () => {
  test('reports healthy polling and a future meeting', () => {
    const now = new Date('2026-08-10T23:00:00.000Z');
    const alerts = OperationalDiagnosticsService.buildAlerts({
      now,
      youtube: { connected: true, lastPolledAt: new Date('2026-08-10T22:59:00.000Z'), replies: { not_eligible: 0 } },
      meetings: { pendingBooking: 0, futureScheduled: 1, expiredScheduled: 0, failed: 0 },
    });
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'youtube_healthy', severity: 'healthy' }),
      expect.objectContaining({ code: 'meeting_scheduled', severity: 'healthy' }),
    ]));
  });

  test('surfaces stale polling, identity mismatch and failed meetings', () => {
    const now = new Date('2026-08-10T23:10:00.000Z');
    const alerts = OperationalDiagnosticsService.buildAlerts({
      now,
      youtube: { connected: true, lastPolledAt: new Date('2026-08-10T23:00:00.000Z'), replies: { not_eligible: 2 } },
      meetings: { pendingBooking: 1, futureScheduled: 0, expiredScheduled: 1, failed: 1 },
    });
    expect(alerts.map(alert => alert.code)).toEqual(expect.arrayContaining([
      'youtube_poll_stale', 'youtube_identity_mismatch', 'booking_pending', 'meeting_failed', 'meeting_history',
    ]));
  });
});
