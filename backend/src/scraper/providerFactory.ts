import type { ScraperMode, ScraperProvider } from './contracts';
import { ScraperError } from './errors';
import { DemoScraperProvider } from './providers/DemoScraperProvider';
import { FakeScraperProvider, type FakeScraperScenario } from './providers/FakeScraperProvider';
import {
  YouTubeScraperProvider,
  type YouTubeScraperProviderOptions,
} from './providers/YouTubeScraperProvider';
import { YouTubeHttpScraperTransport } from './providers/YouTubeHttpScraperTransport';

export interface ScraperProviderFactoryOptions {
  mode?: string;
  fakeScenario?: FakeScraperScenario;
  youtube?: YouTubeScraperProviderOptions;
}

export function createScraperProvider(options: ScraperProviderFactoryOptions = {}): ScraperProvider {
  const mode = (options.mode ?? process.env.SOCIAL_SCRAPER_MODE ?? 'demo') as ScraperMode;
  if (mode === 'demo') return new DemoScraperProvider();
  if (mode === 'mock') return new FakeScraperProvider(options.fakeScenario);
  if (mode === 'live') {
    const apiKey = options.youtube?.apiKey ?? process.env.YOUTUBE_SCRAPER_API_KEY;
    if (!apiKey?.trim()) throw new ScraperError('CONFIGURATION_ERROR', 'YOUTUBE_SCRAPER_API_KEY no está configurada');
    return new YouTubeScraperProvider({
      ...options.youtube,
      apiKey,
      transport: options.youtube?.transport ?? new YouTubeHttpScraperTransport(apiKey),
    });
  }
  throw new ScraperError('CONFIGURATION_ERROR', `Modo de Social Scraper no soportado: ${mode}`);
}
