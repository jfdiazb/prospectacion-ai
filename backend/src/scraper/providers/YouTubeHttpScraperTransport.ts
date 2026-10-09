import {
  ScraperError,
  type ScraperDiagnostic,
  type ScraperDiagnosticReason,
  type ScraperErrorCode,
} from '../errors';
import { assertValidYouTubeScraperApiKey } from '../youtubeApiKeyValidation';
import { YouTubeScraperQuotaBudget } from '../YouTubeScraperQuotaBudget';
import type {
  YouTubeScraperTransport,
  YouTubeSearchItem,
  YouTubeVideoStatistics,
} from './YouTubeScraperProvider';

const YOUTUBE_DATA_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const API_KEY_INVALID_REASONS = new Set([
  'apiKeyInvalid', 'keyExpired', 'keyInvalid',
  'API_KEY_INVALID', 'API_KEY_NOT_FOUND', 'API_KEY_EXPIRED',
]);
const API_DISABLED_REASONS = new Set(['accessNotConfigured', 'SERVICE_DISABLED']);
const API_KEY_RESTRICTED_REASONS = new Set([
  'ipRefererBlocked',
  'API_KEY_BLOCKED',
  'API_KEY_SERVICE_BLOCKED',
  'API_KEY_HTTP_REFERRER_BLOCKED',
  'API_KEY_IP_ADDRESS_BLOCKED',
  'API_KEY_ANDROID_APP_BLOCKED',
  'API_KEY_IOS_APP_BLOCKED',
]);
const QUOTA_REASONS = new Set([
  'quotaExceeded', 'dailyLimitExceeded', 'rateLimitExceeded', 'userRateLimitExceeded',
  'QUOTA_EXCEEDED', 'RATE_LIMIT_EXCEEDED', 'RESOURCE_EXHAUSTED',
]);
const ACCESS_DENIED_REASONS = new Set(['forbidden', 'PERMISSION_DENIED']);

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

interface GoogleErrorBody {
  error?: {
    errors?: Array<{ reason?: unknown }>;
    details?: Array<{ reason?: unknown; domain?: unknown; metadata?: unknown }>;
    status?: unknown;
  };
}

function googleReasons(body: unknown): string[] {
  const googleError = body && typeof body === 'object' ? body as GoogleErrorBody : undefined;
  return [
    ...(googleError?.error?.errors ?? []),
    ...(googleError?.error?.details ?? []),
  ]
    .map(item => typeof item?.reason === 'string' ? item.reason : '')
    .filter(Boolean);
}

function classifyGoogleRejection(status: number, body: unknown): {
  code: ScraperErrorCode;
  message: string;
  reason: ScraperDiagnosticReason;
} {
  const reasons = googleReasons(body);
  const googleStatus = body && typeof body === 'object'
    ? (body as GoogleErrorBody).error?.status
    : undefined;

  if (status === 429 || googleStatus === 'RESOURCE_EXHAUSTED' || reasons.some(reason => QUOTA_REASONS.has(reason))) {
    return { code: 'PROVIDER_RATE_LIMIT', message: 'La cuota o límite del proveedor fue alcanzado', reason: 'QUOTA_EXCEEDED' };
  }
  if (reasons.some(reason => API_KEY_INVALID_REASONS.has(reason))) {
    return { code: 'CONFIGURATION_ERROR', message: 'La credencial de YouTube no es válida', reason: 'API_KEY_INVALID' };
  }
  if (reasons.some(reason => API_DISABLED_REASONS.has(reason))) {
    return { code: 'CONFIGURATION_ERROR', message: 'YouTube Data API no está habilitada para la credencial', reason: 'API_DISABLED' };
  }
  if (reasons.some(reason => API_KEY_RESTRICTED_REASONS.has(reason))) {
    return { code: 'CONFIGURATION_ERROR', message: 'Las restricciones de la credencial rechazaron la consulta', reason: 'API_KEY_RESTRICTED' };
  }
  if (status === 401 || googleStatus === 'PERMISSION_DENIED' || reasons.some(reason => ACCESS_DENIED_REASONS.has(reason))) {
    return { code: 'CONFIGURATION_ERROR', message: 'YouTube denegó el acceso a la consulta', reason: 'ACCESS_DENIED' };
  }
  if (status === 400 || googleStatus === 'INVALID_ARGUMENT') {
    return { code: 'PROVIDER_UPSTREAM_ERROR', message: 'YouTube rechazó los parámetros de la consulta', reason: 'INVALID_REQUEST' };
  }
  return { code: 'PROVIDER_UPSTREAM_ERROR', message: 'YouTube rechazó la consulta', reason: 'UPSTREAM_REJECTED' };
}

interface YouTubeSnippetBody {
  title?: unknown;
  description?: unknown;
  channelId?: unknown;
  channelTitle?: unknown;
  publishedAt?: unknown;
  thumbnails?: { medium?: { url?: unknown }; default?: { url?: unknown } };
}

interface SearchListBody {
  items?: Array<{
    id?: { videoId?: unknown };
    snippet?: YouTubeSnippetBody;
  }>;
}

interface VideosListBody {
  items?: Array<{
    id?: unknown;
    snippet?: YouTubeSnippetBody;
    statistics?: {
      viewCount?: unknown;
      likeCount?: unknown;
      commentCount?: unknown;
    };
  }>;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requiredString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export class YouTubeHttpScraperTransport implements YouTubeScraperTransport {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: FetchLike = globalThis.fetch,
    private readonly baseUrl = YOUTUBE_DATA_API_BASE_URL
  ) {
    assertValidYouTubeScraperApiKey(apiKey);
    if (typeof fetchImpl !== 'function') {
      throw new ScraperError('CONFIGURATION_ERROR', 'El transporte HTTP del Social Scraper no está disponible');
    }
  }

  async searchList(params: { query: string; maxResults: number; signal: AbortSignal }): Promise<YouTubeSearchItem[]> {
    const maxResults = Math.max(1, Math.min(10, Math.trunc(params.maxResults)));
    const url = new URL(`${this.baseUrl}/search`);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('q', params.query);
    url.searchParams.set('maxResults', String(maxResults));
    const body = await this.request<SearchListBody>(url, params.signal, 100);
    if (!Array.isArray(body.items)) {
      throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió una respuesta de búsqueda inválida');
    }
    return body.items.map(item => {
      const videoId = requiredString(item.id?.videoId);
      const title = requiredString(item.snippet?.title);
      if (!videoId || !title) {
        throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió una respuesta de búsqueda inválida');
      }
      return {
        videoId,
        title,
        description: optionalString(item.snippet?.description),
        channelId: optionalString(item.snippet?.channelId),
        channelTitle: optionalString(item.snippet?.channelTitle),
        publishedAt: optionalString(item.snippet?.publishedAt),
        thumbnailUrl: optionalString(item.snippet?.thumbnails?.medium?.url)
          ?? optionalString(item.snippet?.thumbnails?.default?.url),
      };
    });
  }

  async videosList(params: { videoIds: string[]; signal: AbortSignal }): Promise<YouTubeVideoStatistics[]> {
    if (!params.videoIds.length) return [];
    const url = new URL(`${this.baseUrl}/videos`);
    url.searchParams.set('part', 'snippet,statistics');
    url.searchParams.set('id', params.videoIds.slice(0, 10).join(','));
    const body = await this.request<VideosListBody>(url, params.signal, 1);
    if (!Array.isArray(body.items)) {
      throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió estadísticas inválidas');
    }
    return body.items.map(item => {
      const videoId = requiredString(item.id);
      if (!videoId) throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió estadísticas inválidas');
      return {
        videoId,
        title: optionalString(item.snippet?.title),
        description: optionalString(item.snippet?.description),
        channelId: optionalString(item.snippet?.channelId),
        channelTitle: optionalString(item.snippet?.channelTitle),
        publishedAt: optionalString(item.snippet?.publishedAt),
        thumbnailUrl: optionalString(item.snippet?.thumbnails?.medium?.url)
          ?? optionalString(item.snippet?.thumbnails?.default?.url),
        viewCount: optionalString(item.statistics?.viewCount),
        likeCount: optionalString(item.statistics?.likeCount),
        commentCount: optionalString(item.statistics?.commentCount),
      };
    });
  }

  private async request<T>(url: URL, signal: AbortSignal, estimatedQuotaUnits: number): Promise<T> {
    await YouTubeScraperQuotaBudget.reserve(estimatedQuotaUnits);
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'x-goog-api-key': this.apiKey },
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new ScraperError('PROVIDER_UPSTREAM_ERROR', 'YouTube no está disponible temporalmente', { cause: error });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch (error) {
      throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió una respuesta inválida', { cause: error });
    }
    if (!response.ok) throw this.mapHttpError(response.status, body);
    if (!body || typeof body !== 'object') {
      throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió una respuesta inválida');
    }
    return body as T;
  }

  private mapHttpError(status: number, body: unknown): ScraperError {
    if (status >= 500) {
      return new ScraperError('PROVIDER_UPSTREAM_ERROR', 'YouTube no está disponible temporalmente');
    }
    const rejection = classifyGoogleRejection(status, body);
    const diagnostic: ScraperDiagnostic = {
      provider: 'youtube',
      httpStatus: status,
      reason: rejection.reason,
    };
    return new ScraperError(rejection.code, rejection.message, { diagnostic });
  }
}
