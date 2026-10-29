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

describe('release certification readiness', () => {
  const originalEnv = process.env;

  afterEach(() => { process.env = originalEnv; });

  test('rejects a behavioral certificate issued for a different deployed commit', async () => {
    process.env = {
      ...originalEnv,
      BEHAVIORAL_CERTIFICATION_VERSION: 'behavioral-commercial-v1',
      BEHAVIORAL_CERTIFICATION_STATUS: 'passed',
      RELEASE_COMMIT: 'certified-commit',
      RENDER_GIT_COMMIT: 'deployed-commit',
    };

    const readiness = await ReadinessService.inspect();

    expect(readiness.behavioralReady).toBe(false);
    expect(readiness.goLive).toBe(false);
    expect(readiness.behavioralCertification).toMatchObject({
      status: 'missing_or_stale',
      releaseCommit: 'certified-commit',
      deployedCommit: 'deployed-commit',
      commitMatches: false,
    });
  });

  test('accepts a behavioral certificate only for the deployed commit', async () => {
    process.env = {
      ...originalEnv,
      BEHAVIORAL_CERTIFICATION_VERSION: 'behavioral-commercial-v1',
      BEHAVIORAL_CERTIFICATION_STATUS: 'passed',
      RELEASE_COMMIT: 'same-commit',
      RENDER_GIT_COMMIT: 'same-commit',
    };

    const readiness = await ReadinessService.inspect();

    expect(readiness.behavioralReady).toBe(true);
    expect(readiness.behavioralCertification.commitMatches).toBe(true);
  });

  test('does not certify external delivery from API acceptance alone', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      WHATSAPP_MESSAGING_MODE: 'mock',
      INSTAGRAM_MESSAGING_MODE: 'mock',
      FACEBOOK_MESSAGING_MODE: 'mock',
      YOUTUBE_MESSAGING_MODE: 'live',
      YOUTUBE_CLIENT_ID: 'configured',
      YOUTUBE_CLIENT_SECRET: 'configured',
      CRM_OWNER_ID: 'configured',
      BEHAVIORAL_CERTIFICATION_VERSION: 'behavioral-commercial-v1',
      BEHAVIORAL_CERTIFICATION_STATUS: 'passed',
      RELEASE_COMMIT: 'same-commit',
      RENDER_GIT_COMMIT: 'same-commit',
    };
    const readiness = await ReadinessService.inspect();

    expect(readiness.externalDeliveryReady).toBe(false);
    expect(readiness.externalDeliveryCertification).toMatchObject({ status: 'not_verified', enabledChannels: expect.arrayContaining(['youtube']), confirmedChannels: [] });
    expect(readiness.goLive).toBe(false);
  });

  test('reports effective demo scraper mode without pretending that credentials were checked', async () => {
    process.env = {
      ...originalEnv,
      SOCIAL_SCRAPER_MODE: 'demo',
      ALLOW_YOUTUBE_SCRAPER_PROBE: 'false',
    };

    const readiness = await ReadinessService.inspect();

    expect(readiness.configuration.socialScraper).toEqual({
      mode: 'demo',
      provider: 'alma-demo-fixture',
      credentialConfigured: false,
      quotaProbeAuthorized: false,
      intentionallyDisabled: true,
    });
  });

  test('blocks certification when automatic WhatsApp replies contradict effective outbound mode', async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'production',
      MONGO_URI: 'configured',
      JWT_SECRET: 'configured',
      CORS_ORIGIN: 'https://example.test',
      WHATSAPP_MESSAGING_MODE: 'mock',
      WHATSAPP_AUTO_REPLY_ENABLED: 'true',
      WHATSAPP_REPLY_MODE: 'automatic',
      BEHAVIORAL_CERTIFICATION_VERSION: 'behavioral-commercial-v1',
      BEHAVIORAL_CERTIFICATION_STATUS: 'passed',
      RELEASE_COMMIT: 'same-commit',
      RENDER_GIT_COMMIT: 'same-commit',
    };

    const readiness = await ReadinessService.inspect();

    expect(readiness.configuration.consistent).toBe(false);
    expect(readiness.configuration.issues).toContainEqual({
      severity: 'critical',
      code: 'whatsapp_automatic_without_live_outbound',
    });
    expect(readiness.goLive).toBe(false);
  });
});
