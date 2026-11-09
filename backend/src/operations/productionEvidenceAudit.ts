type Classification = 'CONFIRMADO' | 'HIPÓTESIS' | 'NO_VERIFICADO';
type EvidenceItem = { claim: string; classification: Classification; evidence: string };
type AuditDependencies = { env?: NodeJS.ProcessEnv; fetch?: typeof globalThis.fetch; now?: () => Date; log?: (message: string) => void; logError?: (message: string) => void };
type ReadinessPayload = { success?: boolean; configuration?: { deployedCommit?: string | null; socialScraper?: { mode?: string; provider?: string; credentialConfigured?: boolean } }; behavioralCertification?: { deployedCommit?: string | null } };

const baseUrl = (value: string) => value.trim().replace(/\/+$/, '');
async function getJson(fetcher: typeof globalThis.fetch, url: string, init?: RequestInit) {
  const response = await fetcher(url, { ...init, signal: AbortSignal.timeout(15000) });
  return { response, body: await response.json().catch(() => undefined) };
}

export async function collectProductionEvidence(dependencies: AuditDependencies = {}) {
  const env = dependencies.env ?? process.env;
  const fetcher = dependencies.fetch ?? globalThis.fetch;
  const checkedAt = (dependencies.now ?? (() => new Date()))().toISOString();
  const url = baseUrl(env.ALMA_PRODUCTION_URL || 'https://alma-backend-9eo1.onrender.com');
  const expectedCommit = env.EXPECTED_RELEASE_COMMIT?.trim();
  if (!expectedCommit) throw new Error('EXPECTED_RELEASE_COMMIT is required');
  const items: EvidenceItem[] = [];
  const ready = await getJson(fetcher, `${url}/api/v1/readiness`);
  const readiness = ready.body as ReadinessPayload | undefined;
  if (!ready.response.ok || !readiness?.success) throw new Error(`Production readiness unavailable (HTTP ${ready.response.status})`);
  const deployedCommit = readiness.configuration?.deployedCommit || readiness.behavioralCertification?.deployedCommit;
  items.push({ claim: 'sha_exacto_desplegado', classification: deployedCommit === expectedCommit ? 'CONFIRMADO' : 'NO_VERIFICADO', evidence: deployedCommit === expectedCommit ? 'readiness_sha_match' : 'readiness_sha_mismatch' });
  const scraper = readiness.configuration?.socialScraper;
  items.push({ claim: 'social_scraper_live', classification: scraper?.mode === 'live' && scraper?.provider === 'youtube' ? 'CONFIRMADO' : 'NO_VERIFICADO', evidence: `readiness_mode=${scraper?.mode || 'missing'};provider=${scraper?.provider || 'missing'}` });
  items.push({ claim: 'credencial_social_scraper_configurada', classification: scraper?.credentialConfigured ? 'CONFIRMADO' : 'NO_VERIFICADO', evidence: 'readiness_presence_only_not_validity' });
  const token = env.ALMA_PRODUCTION_BEARER_TOKEN?.trim();
  if (!token) {
    items.push({ claim: 'social_scraper_datos_reales', classification: 'NO_VERIFICADO', evidence: 'authenticated_readback_not_executed' });
  } else {
    const readback = await getJson(fetcher, `${url}/api/v1/social-scraper/hashtag`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ hashtag: env.EVIDENCE_SCRAPER_HASHTAG?.trim() || 'emprendimiento' }) });
    const data = readback.body?.data;
    const confirmed = readback.response.ok && readback.body?.success === true && data?.mode === 'live' && data?.source === 'youtube-data-api-v3' && data?.platform === 'youtube' && data?.cached === false && Array.isArray(data?.topPosts) && Number(data?.sampleSize) === data.topPosts.length;
    items.push({ claim: 'social_scraper_datos_reales', classification: confirmed ? 'CONFIRMADO' : 'NO_VERIFICADO', evidence: confirmed ? `authenticated_provider_readback;sampleSize=${data.sampleSize}` : `authenticated_readback_failed;http=${readback.response.status}` });
  }
  return { environment: 'production', checkedAt, expectedCommit, deployedCommit: deployedCommit || null, items };
}

export async function runProductionEvidenceAudit(dependencies: AuditDependencies = {}): Promise<number> {
  const log = dependencies.log ?? console.info;
  const logError = dependencies.logError ?? console.error;
  try {
    const report = await collectProductionEvidence(dependencies);
    log(JSON.stringify(report));
    const required = report.items.filter(item => ['sha_exacto_desplegado', 'social_scraper_live', 'social_scraper_datos_reales'].includes(item.claim));
    return required.every(item => item.classification === 'CONFIRMADO') ? 0 : 2;
  } catch (error) {
    logError(JSON.stringify({ environment: 'production', classification: 'NO_VERIFICADO', error: error instanceof Error ? error.message : 'unknown' }));
    return 1;
  }
}

if (require.main === module) void runProductionEvidenceAudit().then(code => { process.exitCode = code; });
