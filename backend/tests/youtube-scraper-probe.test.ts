import type { YouTubeScraperTransport } from '../src/scraper/providers/YouTubeScraperProvider';
import { ScraperError } from '../src/scraper/errors';
import {
  runYouTubeScraperProbe,
  runYouTubeScraperProbeCli,
} from '../src/operations/youtubeScraperProbe';

const SECRET = 'PROBE_SECRET_MUST_NEVER_BE_LOGGED';

function fakeTransport(video = true): jest.Mocked<YouTubeScraperTransport> {
  return {
    searchList: jest.fn(async (_params: { query: string; maxResults: number; signal: AbortSignal }) =>
      video ? [{ videoId: 'video-1', title: 'Observed' }] : []),
    videosList: jest.fn(async (_params: { videoIds: string[]; signal: AbortSignal }) =>
      [{ videoId: 'video-1', viewCount: '1' }]),
  };
}

function authorizedEnv(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ALLOW_YOUTUBE_SCRAPER_PROBE: 'true',
    SOCIAL_SCRAPER_MODE: 'demo',
    YOUTUBE_SCRAPER_API_KEY: SECRET,
    ...overrides,
  };
}

describe('YouTube Social Scraper one-shot probe', () => {
  test('sin bandera falla antes de crear transporte', async () => {
    const createTransport = jest.fn();
    await expect(runYouTubeScraperProbe({
      env: authorizedEnv({ ALLOW_YOUTUBE_SCRAPER_PROBE: undefined }),
      createTransport,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  test('con modo live falla antes de crear transporte', async () => {
    const createTransport = jest.fn();
    await expect(runYouTubeScraperProbe({
      env: authorizedEnv({ SOCIAL_SCRAPER_MODE: 'live' }),
      createTransport,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  test('sin clave falla de forma segura antes de cualquier request', async () => {
    const createTransport = jest.fn();
    await expect(runYouTubeScraperProbe({
      env: authorizedEnv({ YOUTUBE_SCRAPER_API_KEY: undefined }),
      createTransport,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  test.each([
    [` ${SECRET}`, 'espacio inicial'],
    [`${SECRET} `, 'espacio final'],
    [`${SECRET}\t`, 'tabulación'],
    [`${SECRET}\r\n`, 'CR/LF'],
    [`${SECRET}\u0000`, 'carácter de control'],
    [`${SECRET}ñ`, 'Unicode'],
  ])('rechaza %s (%s) sin construir transporte', async (invalidKey) => {
    const createTransport = jest.fn();
    await expect(runYouTubeScraperProbe({
      env: authorizedEnv({ YOUTUBE_SCRAPER_API_KEY: invalidKey }),
      createTransport,
    })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' });
    expect(createTransport).not.toHaveBeenCalled();
  });

  test('realiza como máximo una búsqueda y una lectura de estadísticas con maxResults=1', async () => {
    const transport = fakeTransport();
    const createTransport = jest.fn(() => transport);
    const result = await runYouTubeScraperProbe({ env: authorizedEnv(), createTransport });

    expect(createTransport).toHaveBeenCalledTimes(1);
    expect(createTransport).toHaveBeenCalledWith(SECRET);
    expect(transport.searchList).toHaveBeenCalledTimes(1);
    expect(transport.searchList).toHaveBeenCalledWith(expect.objectContaining({
      query: 'emprendimiento',
      maxResults: 1,
    }));
    expect(transport.videosList).toHaveBeenCalledTimes(1);
    expect(transport.videosList).toHaveBeenCalledWith(expect.objectContaining({ videoIds: ['video-1'] }));
    expect(result).toMatchObject({ searchRequests: 1, videosRequests: 1, estimatedQuotaUnits: 101 });
  });

  test('una búsqueda vacía finaliza sin solicitar videos.list', async () => {
    const transport = fakeTransport(false);
    const result = await runYouTubeScraperProbe({
      env: authorizedEnv(),
      createTransport: () => transport,
    });
    expect(transport.searchList).toHaveBeenCalledTimes(1);
    expect(transport.videosList).not.toHaveBeenCalled();
    expect(result).toMatchObject({ videosRequests: 0, resultCount: 0, estimatedQuotaUnits: 100 });
  });

  test('los tests usan transporte inyectado y no realizan fetch externo', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    await runYouTubeScraperProbe({ env: authorizedEnv(), createTransport: () => fakeTransport() });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  test('logs exitosos y fallidos no contienen el secreto', async () => {
    const messages: string[] = [];
    const successCode = await runYouTubeScraperProbeCli({
      env: authorizedEnv(),
      createTransport: () => fakeTransport(),
      log: message => messages.push(message),
      logError: message => messages.push(message),
    });
    const failureCode = await runYouTubeScraperProbeCli({
      env: authorizedEnv({ SOCIAL_SCRAPER_MODE: 'live' }),
      createTransport: () => fakeTransport(),
      log: message => messages.push(message),
      logError: message => messages.push(message),
    });
    expect(successCode).toBe(0);
    expect(failureCode).toBe(1);
    expect(messages.join('\n')).not.toContain(SECRET);
  });

  test('CLI expone solo el diagnóstico sanitizado del rechazo HTTP', async () => {
    const messages: string[] = [];
    const transport = fakeTransport();
    transport.searchList.mockRejectedValue(new ScraperError(
      'CONFIGURATION_ERROR',
      'La credencial de YouTube no es válida',
      { diagnostic: { provider: 'youtube', httpStatus: 400, reason: 'API_KEY_INVALID' } }
    ));
    const exitCode = await runYouTubeScraperProbeCli({
      env: authorizedEnv(),
      createTransport: () => transport,
      log: message => messages.push(message),
      logError: message => messages.push(message),
    });
    expect(exitCode).toBe(1);
    expect(JSON.parse(messages.join(''))).toEqual({
      ok: false,
      operation: 'youtube-scraper-probe',
      error: 'CONFIGURATION_ERROR',
      message: 'La credencial de YouTube no es válida',
      diagnostic: { provider: 'youtube', httpStatus: 400, reason: 'API_KEY_INVALID' },
    });
    expect(messages.join('\n')).not.toContain(SECRET);
  });

  test('no altera el proveedor demo ni consulta red con la clave presente', async () => {
    const previousMode = process.env.SOCIAL_SCRAPER_MODE;
    const previousKey = process.env.YOUTUBE_SCRAPER_API_KEY;
    process.env.SOCIAL_SCRAPER_MODE = 'demo';
    process.env.YOUTUBE_SCRAPER_API_KEY = SECRET;
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('NETWORK_FORBIDDEN'));
    const { createScraperProvider } = await import('../src/scraper/providerFactory');
    const result = await createScraperProvider().scrapeHashtag('ventas');
    expect(result).toMatchObject({ mode: 'demo', source: 'alma-demo-fixture' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
    if (previousMode === undefined) delete process.env.SOCIAL_SCRAPER_MODE;
    else process.env.SOCIAL_SCRAPER_MODE = previousMode;
    if (previousKey === undefined) delete process.env.YOUTUBE_SCRAPER_API_KEY;
    else process.env.YOUTUBE_SCRAPER_API_KEY = previousKey;
  });
});
