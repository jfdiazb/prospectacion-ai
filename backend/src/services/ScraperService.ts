import type { HashtagScrapeResult, ProfileScrapeResult, ScraperMode, ScraperProvider } from '../scraper/contracts';
import { createScraperProvider } from '../scraper/providerFactory';

/**
 * Servicio de Social Scraper
 */
export class ScraperService {
  constructor(private readonly provider: ScraperProvider = createScraperProvider()) {}

  async scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult> {
    return this.provider.scrapeHashtag(hashtag);
  }

  async scrapeProfile(params: {
    username: string;
    platform: string;
  }): Promise<ProfileScrapeResult> {
    return this.provider.scrapeProfile(params);
  }

  static async scrapeHashtag(hashtag: string): Promise<HashtagScrapeResult> {
    return new ScraperService().scrapeHashtag(hashtag);
  }

  static async scrapeProfile(params: { username: string; platform: string }): Promise<ProfileScrapeResult> {
    return new ScraperService().scrapeProfile(params);
  }

  static status(): { mode: ScraperMode } {
    return { mode: createScraperProvider().mode };
  }
}
