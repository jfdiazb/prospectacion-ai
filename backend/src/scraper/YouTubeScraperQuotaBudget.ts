import YouTubeQuotaUsage from '../models/YouTubeQuotaUsage';
import { ScraperError } from './errors';

const SCOPE_ID = 'social-scraper:global';
const QUOTA_TIMEZONE = 'America/Los_Angeles';

export function youtubeQuotaDay(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: QUOTA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function youtubeScraperDailyBudget(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET;
  const parsed = raw === undefined ? Number.NaN : Number(raw);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 10000) {
    throw new ScraperError(
      'CONFIGURATION_ERROR',
      'YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET no está configurado correctamente'
    );
  }
  return parsed;
}

export class YouTubeScraperQuotaBudget {
  static async reserve(units: number, now = new Date()): Promise<{ day: string; used: number; budget: number }> {
    const budget = youtubeScraperDailyBudget();
    if (!Number.isInteger(units) || units < 1 || units > budget) {
      throw new ScraperError('PROVIDER_RATE_LIMIT', 'El presupuesto diario del Social Scraper no permite esta consulta');
    }
    const day = youtubeQuotaDay(now);

    try {
      await YouTubeQuotaUsage.updateOne(
        { scopeId: SCOPE_ID, day },
        { $setOnInsert: { scopeId: SCOPE_ID, day, searchCalls: 0, generalUnits: 0 } },
        { upsert: true }
      );
    } catch (error) {
      if ((error as { code?: number })?.code !== 11000) throw error;
    }

    const usage = await YouTubeQuotaUsage.findOneAndUpdate(
      { scopeId: SCOPE_ID, day, generalUnits: { $lte: budget - units } },
      { $inc: { generalUnits: units, searchCalls: units === 100 ? 1 : 0 } },
      { new: true }
    ).lean();

    if (!usage) {
      throw new ScraperError('PROVIDER_RATE_LIMIT', 'Se alcanzó el presupuesto diario del Social Scraper');
    }
    return { day, used: usage.generalUnits, budget };
  }
}
