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
});
