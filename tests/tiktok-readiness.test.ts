import { ReadinessService } from '../src/services/ReadinessService';

describe('TikTok operational readiness', () => {
  const original = {
    approved: process.env.TIKTOK_API_APPROVED,
    ingestion: process.env.TIKTOK_INGESTION_ENABLED,
    messaging: process.env.TIKTOK_MESSAGING_ENABLED,
  };

  afterEach(() => {
    process.env.TIKTOK_API_APPROVED = original.approved;
    process.env.TIKTOK_INGESTION_ENABLED = original.ingestion;
    process.env.TIKTOK_MESSAGING_ENABLED = original.messaging;
  });

  test('does not report LIVE from feature flags without an official transport', async () => {
    process.env.TIKTOK_API_APPROVED = 'true';
    process.env.TIKTOK_INGESTION_ENABLED = 'true';
    process.env.TIKTOK_MESSAGING_ENABLED = 'true';

    const readiness = await ReadinessService.inspect();

    expect(readiness.runtime.providers.tiktok).toEqual({
      inbound: 'pending',
      outbound: 'pending',
      configured: false,
      requested: true,
      reason: 'official_transport_not_configured',
    });
  });
});
