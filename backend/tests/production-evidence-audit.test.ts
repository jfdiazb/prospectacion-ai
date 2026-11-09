import { collectProductionEvidence, runProductionEvidenceAudit } from '../src/operations/productionEvidenceAudit';

const readiness = (commit = 'sha-1') => ({ success: true, configuration: { deployedCommit: commit, socialScraper: { mode: 'live', provider: 'youtube', credentialConfigured: true } }, behavioralCertification: { deployedCommit: commit } });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('production evidence audit', () => {
  test('presence never certifies real data without authenticated readback', async () => {
    const report = await collectProductionEvidence({ env: { EXPECTED_RELEASE_COMMIT: 'sha-1', ALMA_PRODUCTION_URL: 'https://example.test' }, fetch: jest.fn().mockResolvedValue(response(readiness())), now: () => new Date('2026-11-08T21:00:00Z') });
    expect(report.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ claim: 'sha_exacto_desplegado', classification: 'CONFIRMADO' }),
      expect.objectContaining({ claim: 'credencial_social_scraper_configurada', evidence: 'readiness_presence_only_not_validity' }),
      expect.objectContaining({ claim: 'social_scraper_datos_reales', classification: 'NO_VERIFICADO' }),
    ]));
  });

  test('certifies real data only from authenticated live provider readback', async () => {
    const fetcher = jest.fn().mockResolvedValueOnce(response(readiness())).mockResolvedValueOnce(response({ success: true, data: { mode: 'live', source: 'youtube-data-api-v3', platform: 'youtube', cached: false, sampleSize: 1, topPosts: [{ id: 'video-1' }] } }));
    const report = await collectProductionEvidence({ env: { EXPECTED_RELEASE_COMMIT: 'sha-1', ALMA_PRODUCTION_URL: 'https://example.test', ALMA_PRODUCTION_BEARER_TOKEN: 'secret-token' }, fetch: fetcher });
    expect(report.items).toContainEqual(expect.objectContaining({ claim: 'social_scraper_datos_reales', classification: 'CONFIRMADO' }));
    expect(fetcher.mock.calls[1][1].headers.Authorization).toBe('Bearer secret-token');
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });

  test('SHA mismatch remains not verified and fails the audit', async () => {
    const messages: string[] = [];
    const code = await runProductionEvidenceAudit({ env: { EXPECTED_RELEASE_COMMIT: 'sha-expected', ALMA_PRODUCTION_URL: 'https://example.test' }, fetch: jest.fn().mockResolvedValue(response(readiness('sha-other'))), log: value => messages.push(value), logError: value => messages.push(value) });
    expect(code).toBe(2);
    expect(JSON.parse(messages[0]).items).toContainEqual(expect.objectContaining({ claim: 'sha_exacto_desplegado', classification: 'NO_VERIFICADO' }));
  });
});
