import type { HashtagScrapeResult, ProfileScrapeResult, ScraperProvider } from '../contracts';
import { ScraperError, asScraperError } from '../errors';

export interface YouTubeSearchItem {
  videoId: string;
  title: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
}

export interface YouTubeVideoStatistics {
  videoId: string;
  title?: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  viewCount?: string;
  likeCount?: string;
  commentCount?: string;
}

export interface YouTubeScraperTransport {
  searchList(params: { query: string; maxResults: number; signal: AbortSignal }): Promise<YouTubeSearchItem[]>;
  videosList(params: { videoIds: string[]; signal: AbortSignal }): Promise<YouTubeVideoStatistics[]>;
}

export interface YouTubeScraperProviderOptions {
  apiKey?: string;
  transport?: YouTubeScraperTransport;
  timeoutMs?: number;
  maxResults?: number;
}

function parseCount(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió estadísticas inválidas');
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió estadísticas inválidas');
  return parsed;
}

export function calculateEngagementRate(input: { views?: number; likes?: number; comments?: number }): number {
  if (!input.views) return 0;
  return (((input.likes ?? 0) + (input.comments ?? 0)) / input.views) * 100;
}

export class YouTubeScraperProvider implements ScraperProvider {
  readonly mode = 'live' as const;
  readonly platform = 'youtube' as const;
  readonly source = 'youtube-data-api-v3';
  private readonly timeoutMs: number;
  private readonly maxResults: number;

  constructor(private readonly options: YouTubeScraperProviderOptions) {
    if (!options.apiKey?.trim()) {
      throw new ScraperError('CONFIGURATION_ERROR', 'YOUTUBE_SCRAPER_API_KEY no está configurada');
    }
    if (!options.transport) {
      throw new ScraperError('CONFIGURATION_ERROR', 'El transporte live del Social Scraper no está habilitado');
    }
    this.timeoutMs = options.timeoutMs ?? 8000;
    this.maxResults = Math.max(1, Math.min(10, Math.trunc(options.maxResults ?? 10)));
  }

  async scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const searchItems = await this.options.transport!.searchList({
        query: hashtag,
        maxResults: this.maxResults,
        signal: controller.signal,
      });
      if (!Array.isArray(searchItems) || searchItems.some(item => !item?.videoId || typeof item.title !== 'string')) {
        throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió una respuesta de búsqueda inválida');
      }
      const statistics = searchItems.length
        ? await this.options.transport!.videosList({ videoIds: searchItems.map(item => item.videoId), signal: controller.signal })
        : [];
      if (!Array.isArray(statistics)) {
        throw new ScraperError('PROVIDER_INVALID_RESPONSE', 'YouTube devolvió estadísticas inválidas');
      }
      const statsById = new Map(statistics.map(item => [item.videoId, item]));
      const topPosts = searchItems.map(item => {
        const stats = statsById.get(item.videoId);
        const views = parseCount(stats?.viewCount);
        const likes = parseCount(stats?.likeCount);
        const comments = parseCount(stats?.commentCount);
        const engagement = calculateEngagementRate({ views, likes, comments });
        return {
          id: item.videoId,
          text: stats?.title ?? item.title,
          description: stats?.description ?? item.description,
          channelId: stats?.channelId ?? item.channelId,
          channelTitle: stats?.channelTitle ?? item.channelTitle,
          publishedAt: stats?.publishedAt ?? item.publishedAt,
          thumbnailUrl: stats?.thumbnailUrl ?? item.thumbnailUrl,
          engagement,
          views,
          likes,
          comments,
          engagementMetric: {
            value: engagement,
            formula: '(likes + comments) / views' as const,
            calculatedBy: 'alma-social-scraper' as const,
          },
        };
      });
      const average = topPosts.length
        ? topPosts.reduce((sum, post) => sum + post.engagement, 0) / topPosts.length
        : 0;
      return {
        hashtag,
        totalPosts: topPosts.length,
        avgEngagement: average,
        topPosts,
        mode: this.mode,
        platform: this.platform,
        source: this.source,
        fetchedAt: new Date().toISOString(),
        cached: false,
        sampleSize: topPosts.length,
        observed: { postCount: topPosts.length },
        derivedMetrics: {
          averageEngagementRate: average,
          formula: '(likes + comments) / views',
          calculatedBy: 'alma-social-scraper',
        },
      };
    } catch (error) {
      if (controller.signal.aborted) throw new ScraperError('PROVIDER_TIMEOUT', 'La consulta a YouTube excedió el tiempo límite');
      throw asScraperError(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async scrapeProfile(_params: { username: string; platform: string }): Promise<ProfileScrapeResult> {
    throw new ScraperError('CONFIGURATION_ERROR', 'El modo live inicial solo admite análisis de hashtag en YouTube');
  }
}
