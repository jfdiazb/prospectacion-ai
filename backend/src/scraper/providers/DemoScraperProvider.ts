import type { HashtagScrapeResult, ProfileScrapeResult, ScraperProvider } from '../contracts';

export class DemoScraperProvider implements ScraperProvider {
  readonly mode = 'demo' as const;
  readonly platform = 'demo' as const;
  readonly source = 'alma-demo-fixture';

  async scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult> {
    const topPosts = [
      { id: 'p1', text: 'Estrategias para vender sin ser agresivo', engagement: 14.2 },
      { id: 'p2', text: '3 pasos para captar clientes con contenido diario', engagement: 12.7 },
      { id: 'p3', text: 'Cómo aumentar tu alcance en redes', engagement: 11.9 },
    ];
    return {
      hashtag,
      totalPosts: 1240,
      avgEngagement: 9.3,
      topPosts,
      mode: this.mode,
      platform: this.platform,
      source: this.source,
      fetchedAt: new Date().toISOString(),
      cached: false,
      sampleSize: topPosts.length,
      observed: { postCount: topPosts.length },
      derivedMetrics: {
        averageEngagementRate: 9.3,
        formula: '(likes + comments) / views',
        calculatedBy: 'alma-social-scraper',
      },
    };
  }

  async scrapeProfile(params: { username: string; platform: string }): Promise<ProfileScrapeResult> {
    return {
      username: params.username,
      platform: params.platform,
      profileUrl: `https://www.${params.platform}.com/${params.username}`,
      followers: 13600,
      engagement: 10.4,
      bio: 'Mentor de ventas digitales y captación de clientes en redes sociales',
      recentHashtags: ['#networkmarketing', '#emprendedores', '#ventasonline'],
      mode: this.mode,
      source: this.source,
      fetchedAt: new Date().toISOString(),
      cached: false,
      sampleSize: 1,
    };
  }
}
