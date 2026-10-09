export type ScraperMode = 'demo' | 'mock' | 'live';

export type ScraperPlatform = 'demo' | 'youtube' | 'instagram' | 'facebook' | 'tiktok';

export interface ScraperMetadata {
  mode: ScraperMode;
  platform: string;
  source: string;
  fetchedAt: string;
  cached: boolean;
  sampleSize: number;
}

export interface ScraperPost {
  id: string;
  text: string;
  description?: string;
  channelId?: string;
  channelTitle?: string;
  publishedAt?: string;
  thumbnailUrl?: string;
  engagement: number;
  views?: number;
  likes?: number;
  comments?: number;
  engagementMetric?: {
    value: number;
    formula: '(likes + comments) / views';
    calculatedBy: 'alma-social-scraper';
  };
}

export interface HashtagScrapeResult extends ScraperMetadata {
  hashtag: string;
  /** Legacy field. In live mode it is the observed sample count, never a global total. */
  totalPosts: number;
  /** Legacy alias for the ALMA-calculated average over the observed sample. */
  avgEngagement: number;
  observed: {
    postCount: number;
  };
  derivedMetrics: {
    averageEngagementRate: number;
    formula: '(likes + comments) / views';
    calculatedBy: 'alma-social-scraper';
  };
  topPosts: ScraperPost[];
}

export interface ProfileScrapeResult extends ScraperMetadata {
  username: string;
  platform: string;
  profileUrl: string;
  followers: number;
  engagement: number;
  bio: string;
  recentHashtags: string[];
}

export interface ScraperProvider {
  readonly mode: ScraperMode;
  readonly platform: ScraperPlatform;
  readonly source: string;
  scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult>;
  scrapeProfile(params: { username: string; platform: string }): Promise<ProfileScrapeResult>;
}

export function normalizeHashtag(value: unknown): string {
  if (typeof value !== 'string') throw new Error('El hashtag debe contener entre 2 y 64 caracteres válidos');
  const normalized = value.trim().replace(/^#/, '');
  if (!/^[\p{L}\p{N}_-]{2,64}$/u.test(normalized)) {
    throw new Error('El hashtag debe contener entre 2 y 64 caracteres válidos');
  }
  return normalized;
}
