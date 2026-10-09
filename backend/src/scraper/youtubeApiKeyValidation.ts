import { ScraperError } from './errors';

const YOUTUBE_API_KEY_PATTERN = /^[A-Za-z0-9_-]+$/;

export function assertValidYouTubeScraperApiKey(value: string | undefined): string {
  if (!value || value !== value.trim() || !YOUTUBE_API_KEY_PATTERN.test(value)) {
    throw new ScraperError(
      'CONFIGURATION_ERROR',
      'YOUTUBE_SCRAPER_API_KEY tiene un formato no válido'
    );
  }
  return value;
}
