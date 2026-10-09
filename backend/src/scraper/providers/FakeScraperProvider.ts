import { ScraperError, type ScraperErrorCode } from '../errors';
import type { HashtagScrapeResult, ProfileScrapeResult, ScraperProvider } from '../contracts';
import { DemoScraperProvider } from './DemoScraperProvider';

export type FakeScraperScenario =
  | 'success'
  | 'empty'
  | 'partial'
  | 'timeout'
  | 'configuration'
  | 'rate-limit'
  | 'upstream'
  | 'invalid-response';

const SCENARIO_ERRORS: Partial<Record<FakeScraperScenario, ScraperErrorCode>> = {
  timeout: 'PROVIDER_TIMEOUT',
  configuration: 'CONFIGURATION_ERROR',
  'rate-limit': 'PROVIDER_RATE_LIMIT',
  upstream: 'PROVIDER_UPSTREAM_ERROR',
  'invalid-response': 'PROVIDER_INVALID_RESPONSE',
};

export class FakeScraperProvider implements ScraperProvider {
  readonly mode = 'mock' as const;
  readonly platform = 'youtube' as const;
  readonly source = 'deterministic-test-fixture';

  constructor(private readonly scenario: FakeScraperScenario = 'success') {}

  private failIfConfigured(): void {
    const code = SCENARIO_ERRORS[this.scenario];
    if (code) throw new ScraperError(code, `Escenario simulado: ${this.scenario}`);
  }

  async scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult> {
    this.failIfConfigured();
    const posts = this.scenario === 'empty' ? [] : [
      {
        id: 'fake-video-1',
        text: 'Resultado determinista',
        engagement: this.scenario === 'partial' ? 0 : 3,
        views: this.scenario === 'partial' ? 0 : 100,
        likes: this.scenario === 'partial' ? undefined : 2,
        comments: this.scenario === 'partial' ? undefined : 1,
        engagementMetric: {
          value: this.scenario === 'partial' ? 0 : 3,
          formula: '(likes + comments) / views' as const,
          calculatedBy: 'alma-social-scraper' as const,
        },
      },
    ];
    const average = posts.length ? posts.reduce((sum, post) => sum + post.engagement, 0) / posts.length : 0;
    return {
      hashtag,
      totalPosts: posts.length,
      avgEngagement: average,
      topPosts: posts,
      mode: this.mode,
      platform: this.platform,
      source: this.source,
      fetchedAt: '2026-01-01T00:00:00.000Z',
      cached: false,
      sampleSize: posts.length,
      observed: { postCount: posts.length },
      derivedMetrics: {
        averageEngagementRate: average,
        formula: '(likes + comments) / views',
        calculatedBy: 'alma-social-scraper',
      },
    };
  }

  async scrapeProfile(params: { username: string; platform: string }): Promise<ProfileScrapeResult> {
    this.failIfConfigured();
    const demo = await new DemoScraperProvider().scrapeProfile(params);
    return { ...demo, mode: this.mode, source: this.source, fetchedAt: '2026-01-01T00:00:00.000Z' };
  }
}
