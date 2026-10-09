import { asScraperError, ScraperError } from '../scraper/errors';
import {
  YouTubeHttpScraperTransport,
} from '../scraper/providers/YouTubeHttpScraperTransport';
import type {
  YouTubeScraperTransport,
} from '../scraper/providers/YouTubeScraperProvider';
import { assertValidYouTubeScraperApiKey } from '../scraper/youtubeApiKeyValidation';
import { connectDB, disconnectDB } from '../config/database';

const PROBE_QUERY = 'emprendimiento';
const PROBE_TIMEOUT_MS = 8000;

export interface YouTubeScraperProbeResult {
  ok: true;
  operation: 'youtube-scraper-probe';
  searchRequests: 1;
  videosRequests: 0 | 1;
  resultCount: number;
  estimatedQuotaUnits: 100 | 101;
}

interface ProbeDependencies {
  env?: NodeJS.ProcessEnv;
  createTransport?: (apiKey: string) => YouTubeScraperTransport;
  log?: (message: string) => void;
  logError?: (message: string) => void;
  connectDatabase?: () => Promise<void>;
  disconnectDatabase?: () => Promise<void>;
}

function assertProbeConfiguration(env: NodeJS.ProcessEnv): string {
  if (env.ALLOW_YOUTUBE_SCRAPER_PROBE !== 'true') {
    throw new ScraperError('CONFIGURATION_ERROR', 'La prueba controlada de YouTube no está autorizada');
  }
  if ((env.SOCIAL_SCRAPER_MODE ?? 'demo') !== 'demo') {
    throw new ScraperError('CONFIGURATION_ERROR', 'La prueba solo puede ejecutarse con Social Scraper en modo demo');
  }
  return assertValidYouTubeScraperApiKey(env.YOUTUBE_SCRAPER_API_KEY);
}

export async function runYouTubeScraperProbe(
  dependencies: ProbeDependencies = {}
): Promise<YouTubeScraperProbeResult> {
  const env = dependencies.env ?? process.env;
  const apiKey = assertProbeConfiguration(env);
  const transport = (dependencies.createTransport ?? (key => new YouTubeHttpScraperTransport(key)))(apiKey);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);

  try {
    const searchItems = await transport.searchList({
      query: PROBE_QUERY,
      maxResults: 1,
      signal: controller.signal,
    });
    const firstVideoId = searchItems[0]?.videoId;
    if (firstVideoId) {
      await transport.videosList({ videoIds: [firstVideoId], signal: controller.signal });
    }

    return {
      ok: true,
      operation: 'youtube-scraper-probe',
      searchRequests: 1,
      videosRequests: firstVideoId ? 1 : 0,
      resultCount: firstVideoId ? 1 : 0,
      estimatedQuotaUnits: firstVideoId ? 101 : 100,
    };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ScraperError('PROVIDER_TIMEOUT', 'La prueba controlada excedió el tiempo límite');
    }
    throw asScraperError(error);
  } finally {
    clearTimeout(timeout);
  }
}

export async function runYouTubeScraperProbeCli(dependencies: ProbeDependencies = {}): Promise<number> {
  const log = dependencies.log ?? console.info;
  const logError = dependencies.logError ?? console.error;
  const usesDefaultTransport = dependencies.createTransport === undefined;
  try {
    assertProbeConfiguration(dependencies.env ?? process.env);
    if (usesDefaultTransport) await (dependencies.connectDatabase ?? connectDB)();
    const result = await runYouTubeScraperProbe(dependencies);
    log(JSON.stringify(result));
    return 0;
  } catch (error) {
    const safeError = asScraperError(error);
    logError(JSON.stringify({
      ok: false,
      operation: 'youtube-scraper-probe',
      error: safeError.code,
      message: safeError.message,
      ...(safeError.diagnostic ? { diagnostic: safeError.diagnostic } : {}),
    }));
    return 1;
  } finally {
    if (usesDefaultTransport) await (dependencies.disconnectDatabase ?? disconnectDB)();
  }
}

if (require.main === module) {
  void runYouTubeScraperProbeCli().then(exitCode => {
    process.exitCode = exitCode;
  });
}
