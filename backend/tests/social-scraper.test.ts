import { ScraperController } from '../src/controllers/ScraperController';
import { normalizeHashtag } from '../src/scraper/contracts';
import { ScraperError } from '../src/scraper/errors';
import { createScraperProvider } from '../src/scraper/providerFactory';
import { DemoScraperProvider } from '../src/scraper/providers/DemoScraperProvider';
import { FakeScraperProvider, type FakeScraperScenario } from '../src/scraper/providers/FakeScraperProvider';
import {
  calculateEngagementRate,
  YouTubeScraperProvider,
  type YouTubeScraperTransport,
} from '../src/scraper/providers/YouTubeScraperProvider';
import { ScraperService } from '../src/services/ScraperService';
import { YouTubeScraperQuotaBudget } from '../src/scraper/YouTubeScraperQuotaBudget';

function responseDouble() {
  const response: any = {
    status: jest.fn(() => response),
    json: jest.fn(() => response),
  };
  return response;
}

function transport(overrides: Partial<YouTubeScraperTransport> = {}): YouTubeScraperTransport {
  return {
    searchList: jest.fn(async () => [{ videoId: 'video-1', title: 'Video observado' }]),
    videosList: jest.fn(async () => [{ videoId: 'video-1', viewCount: '100', likeCount: '4', commentCount: '1' }]),
    ...overrides,
  };
}

describe('Social Scraper Fase 2', () => {
  const originalMode = process.env.SOCIAL_SCRAPER_MODE;
  const originalKey = process.env.YOUTUBE_SCRAPER_API_KEY;

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalMode === undefined) delete process.env.SOCIAL_SCRAPER_MODE;
    else process.env.SOCIAL_SCRAPER_MODE = originalMode;
    if (originalKey === undefined) delete process.env.YOUTUBE_SCRAPER_API_KEY;
    else process.env.YOUTUBE_SCRAPER_API_KEY = originalKey;
  });

  test.each([
    ['ventas', 'ventas'],
    ['#ventas', 'ventas'],
    [' #Emprendimiento_2026 ', 'Emprendimiento_2026'],
    ['#niñez', 'niñez'],
  ])('normaliza un hashtag válido una sola vez: %s', (input, expected) => {
    expect(normalizeHashtag(input)).toBe(expected);
  });

  test.each(['a', '#', 'ventas!', '', null, 12])('rechaza hashtag inválido: %p', input => {
    expect(() => normalizeHashtag(input)).toThrow('El hashtag debe contener entre 2 y 64 caracteres válidos');
  });

  test('DemoScraperProvider conserva campos legacy y marca inequívocamente demo', async () => {
    const result = await new DemoScraperProvider().scrapeHashtag('ventas');
    expect(result).toEqual(expect.objectContaining({
      hashtag: 'ventas',
      totalPosts: 1240,
      avgEngagement: 9.3,
      mode: 'demo',
      platform: 'demo',
      source: 'alma-demo-fixture',
      cached: false,
      sampleSize: 3,
    }));
    expect(Date.parse(result.fetchedAt)).not.toBeNaN();
  });

  test('FakeScraperProvider es determinista y no usa Internet', async () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const provider = new FakeScraperProvider('success');
    await expect(provider.scrapeHashtag('ventas')).resolves.toEqual(expect.objectContaining({
      mode: 'mock',
      source: 'deterministic-test-fixture',
      fetchedAt: '2026-01-01T00:00:00.000Z',
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each([
    ['timeout', 'PROVIDER_TIMEOUT', 504],
    ['configuration', 'CONFIGURATION_ERROR', 503],
    ['rate-limit', 'PROVIDER_RATE_LIMIT', 429],
    ['upstream', 'PROVIDER_UPSTREAM_ERROR', 502],
    ['invalid-response', 'PROVIDER_INVALID_RESPONSE', 502],
  ] as Array<[FakeScraperScenario, string, number]>)('simula %s con taxonomía estable', async (scenario, code, status) => {
    await expect(new FakeScraperProvider(scenario).scrapeHashtag('ventas')).rejects.toMatchObject({ code, status });
  });

  test('fake devuelve cero resultados sin inventar métricas', async () => {
    const result = await new FakeScraperProvider('empty').scrapeHashtag('ventas');
    expect(result).toEqual(expect.objectContaining({ totalPosts: 0, avgEngagement: 0, sampleSize: 0 }));
    expect(result.topPosts).toEqual([]);
  });

  test('fake maneja datos parciales y views cero', async () => {
    const result = await new FakeScraperProvider('partial').scrapeHashtag('ventas');
    expect(result.topPosts[0]).toEqual(expect.objectContaining({ views: 0, engagement: 0 }));
    expect(result.topPosts[0].likes).toBeUndefined();
    expect(result.topPosts[0].comments).toBeUndefined();
  });

  test('selecciona modos demo y mock explícitamente', () => {
    expect(createScraperProvider({ mode: 'demo' })).toBeInstanceOf(DemoScraperProvider);
    expect(createScraperProvider({ mode: 'mock' })).toBeInstanceOf(FakeScraperProvider);
  });

  test('rechaza un modo desconocido sin fallback', () => {
    expect(() => createScraperProvider({ mode: 'other' })).toThrow(expect.objectContaining({
      code: 'CONFIGURATION_ERROR',
    }));
  });

  test('live sin credencial falla explícitamente y no crea transporte', () => {
    delete process.env.YOUTUBE_SCRAPER_API_KEY;
    expect(() => createScraperProvider({ mode: 'live' })).toThrow(expect.objectContaining({
      code: 'CONFIGURATION_ERROR',
      message: 'YOUTUBE_SCRAPER_API_KEY no está configurada',
    }));
  });

  test('live con credencial prepara el transporte oficial sin ejecutar una llamada', () => {
    const fetchSpy = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No network allowed'));
    expect(createScraperProvider({ mode: 'live', youtube: { apiKey: 'test-only' } })).toBeInstanceOf(YouTubeScraperProvider);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('YouTube provider usa search.list y videos.list inyectados y calcula engagement ALMA', async () => {
    const fakeTransport = transport();
    const provider = new YouTubeScraperProvider({ apiKey: 'test-only', transport: fakeTransport });
    const result = await provider.scrapeHashtag('ventas');
    expect(fakeTransport.searchList).toHaveBeenCalledWith(expect.objectContaining({ query: 'ventas', maxResults: 10 }));
    expect(fakeTransport.videosList).toHaveBeenCalledWith(expect.objectContaining({ videoIds: ['video-1'] }));
    expect(result).toEqual(expect.objectContaining({
      totalPosts: 1,
      sampleSize: 1,
      observed: { postCount: 1 },
      avgEngagement: 5,
      mode: 'live',
      platform: 'youtube',
      source: 'youtube-data-api-v3',
    }));
    expect(result.derivedMetrics).toEqual({
      averageEngagementRate: 5,
      formula: '(likes + comments) / views',
      calculatedBy: 'alma-social-scraper',
    });
  });

  test('cálculo derivado maneja views cero y estadísticas ausentes', () => {
    expect(calculateEngagementRate({ views: 0, likes: 20, comments: 3 })).toBe(0);
    expect(calculateEngagementRate({ views: 100 })).toBe(0);
    expect(calculateEngagementRate({ views: 200, likes: 8, comments: 2 })).toBe(5);
  });

  test('YouTube provider permite una búsqueda observada vacía sin llamar videos.list', async () => {
    const fakeTransport = transport({ searchList: jest.fn(async () => []) });
    const result = await new YouTubeScraperProvider({ apiKey: 'test-only', transport: fakeTransport }).scrapeHashtag('ventas');
    expect(result.sampleSize).toBe(0);
    expect(result.totalPosts).toBe(0);
    expect(fakeTransport.videosList).not.toHaveBeenCalled();
  });

  test('YouTube provider detecta respuesta inválida', async () => {
    const fakeTransport = transport({ searchList: jest.fn(async () => [{ videoId: '', title: 'inválido' }]) });
    await expect(new YouTubeScraperProvider({ apiKey: 'test-only', transport: fakeTransport }).scrapeHashtag('ventas'))
      .rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE', status: 502 });
  });

  test('YouTube provider convierte abort en timeout explícito', async () => {
    const fakeTransport = transport({
      searchList: jest.fn(({ signal }) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      })),
    });
    await expect(new YouTubeScraperProvider({ apiKey: 'test-only', transport: fakeTransport, timeoutMs: 5 }).scrapeHashtag('ventas'))
      .rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', status: 504 });
  });

  test('servicio acepta provider inyectado sin cargar módulos operativos', async () => {
    const service = new ScraperService(new FakeScraperProvider());
    await expect(service.scrapeHashtag('ventas')).resolves.toMatchObject({ mode: 'mock' });
    const loaded = Object.keys(require.cache).join('\n');
    expect(loaded).not.toMatch(/AutomationEngineService|MessagingService|YouTubeIngestionService|CrmService/);
  });

  test.each(['demo', 'live'] as const)('/status devuelve el modo efectivo sin red ni reserva de cuota: %s', mode => {
    process.env.SOCIAL_SCRAPER_MODE = mode;
    if (mode === 'live') process.env.YOUTUBE_SCRAPER_API_KEY = 'test-only';
    const fetchSpy = jest.spyOn(globalThis, 'fetch');
    const reserveSpy = jest.spyOn(YouTubeScraperQuotaBudget, 'reserve');
    const response = responseDouble();

    ScraperController.status({} as any, response);

    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith({
      success: true,
      message: 'Estado de Social Scraper obtenido',
      data: { mode },
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(reserveSpy).not.toHaveBeenCalled();
  });

  test('/hashtag normaliza en la frontera y conserva envelope HTTP', async () => {
    const serviceSpy = jest.spyOn(ScraperService, 'scrapeHashtag').mockResolvedValue(
      await new FakeScraperProvider().scrapeHashtag('ventas')
    );
    const response = responseDouble();
    await ScraperController.scrapeHashtag({ body: { hashtag: '#ventas' } } as any, response);
    expect(serviceSpy).toHaveBeenCalledWith('ventas');
    expect(response.status).toHaveBeenCalledWith(200);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Datos de hashtag obtenidos',
      data: expect.objectContaining({ hashtag: 'ventas', totalPosts: expect.any(Number), avgEngagement: expect.any(Number) }),
    }));
  });

  test('/hashtag mantiene 400 para validación e incorpora código estable', async () => {
    const response = responseDouble();
    await ScraperController.scrapeHashtag({ body: { hashtag: '!' } } as any, response);
    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'VALIDATION_ERROR' }));
  });

  test('/hashtag preserva el HTTP del error de proveedor', async () => {
    jest.spyOn(ScraperService, 'scrapeHashtag').mockRejectedValue(new ScraperError(
      'PROVIDER_RATE_LIMIT',
      'Cuota agotada',
      { diagnostic: { provider: 'youtube', httpStatus: 403, reason: 'QUOTA_EXCEEDED' } }
    ));
    const response = responseDouble();
    await ScraperController.scrapeHashtag({ body: { hashtag: 'ventas' } } as any, response);
    expect(response.status).toHaveBeenCalledWith(429);
    expect(response.json).toHaveBeenCalledWith({
      success: false,
      message: 'Cuota agotada',
      error: 'PROVIDER_RATE_LIMIT',
    });
  });

  test('/profile conserva compatibilidad en demo y metadatos de procedencia', async () => {
    const result = await new DemoScraperProvider().scrapeProfile({ username: 'alma', platform: 'youtube' });
    expect(result).toEqual(expect.objectContaining({
      username: 'alma',
      platform: 'youtube',
      followers: 13600,
      engagement: 10.4,
      mode: 'demo',
      source: 'alma-demo-fixture',
    }));
  });

  test('el provider YouTube live rechaza profile porque Fase 2 autoriza una sola operación', async () => {
    const provider = new YouTubeScraperProvider({ apiKey: 'test-only', transport: transport() });
    await expect(provider.scrapeProfile({ username: 'alma', platform: 'youtube' })).rejects.toMatchObject({
      code: 'CONFIGURATION_ERROR',
      status: 503,
    });
  });
});
