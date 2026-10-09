import { ScraperError } from '../src/scraper/errors';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { createScraperProvider } from '../src/scraper/providerFactory';
import { YouTubeHttpScraperTransport } from '../src/scraper/providers/YouTubeHttpScraperTransport';
import { YouTubeScraperProvider } from '../src/scraper/providers/YouTubeScraperProvider';
import { YouTubeScraperQuotaBudget } from '../src/scraper/YouTubeScraperQuotaBudget';

const TEST_KEY = 'TEST_SECRET_DO_NOT_EXPOSE';

type FetchMock = jest.MockedFunction<typeof fetch>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function googleError(status: number, reason: string): Response {
  return jsonResponse({ error: { code: status, message: `sensitive ${TEST_KEY}`, errors: [{ reason }] } }, status);
}

function modernGoogleError(status: number, reason: string, googleStatus = 'PERMISSION_DENIED'): Response {
  return jsonResponse({
    error: {
      code: status,
      message: `sensitive upstream message ${TEST_KEY}`,
      status: googleStatus,
      details: [{
        '@type': 'type.googleapis.com/google.rpc.ErrorInfo',
        reason,
        domain: 'googleapis.com',
        metadata: {
          consumer: `projects/sensitive-${TEST_KEY}`,
          resource: `sensitive-resource-${TEST_KEY}`,
        },
      }],
    },
  }, status);
}

function successSearch(totalResults = 999999) {
  return {
    pageInfo: { totalResults, resultsPerPage: 1 },
    nextPageToken: 'ignored-no-pagination',
    items: [{
      id: { videoId: 'video-1' },
      snippet: {
        title: 'Título observado',
        description: 'Descripción pública',
        channelId: 'channel-1',
        channelTitle: 'Canal público',
        publishedAt: '2026-01-02T03:04:05Z',
        thumbnails: { medium: { url: 'https://i.ytimg.com/vi/video-1/mqdefault.jpg' } },
      },
    }],
  };
}

function successVideos(statistics: Record<string, string> | null = {
  viewCount: '100',
  likeCount: '4',
  commentCount: '1',
}) {
  return {
    items: [{
      id: 'video-1',
      snippet: successSearch().items[0].snippet,
    ...(statistics === null ? {} : { statistics }),
    }],
  };
}

function sequentialFetch(...responses: Response[]): FetchMock {
  const mock = jest.fn() as FetchMock;
  for (const response of responses) mock.mockResolvedValueOnce(response);
  return mock;
}

function filesUnder(root: string): string[] {
  return readdirSync(root).flatMap(name => {
    const target = join(root, name);
    return statSync(target).isDirectory() ? filesUnder(target) : [target];
  });
}

describe('Social Scraper Fase 3A - transporte HTTP simulado', () => {
  let unexpectedFetch: jest.SpyInstance;

  beforeEach(() => {
    unexpectedFetch = jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('EXTERNAL NETWORK BLOCKED IN TESTS'));
    jest.spyOn(YouTubeScraperQuotaBudget, 'reserve').mockResolvedValue({ day: '2026-01-01', used: 0, budget: 500 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('search.list usa endpoint oficial, parámetros mínimos y API key en header', async () => {
    const fetchMock = sequentialFetch(jsonResponse(successSearch()));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    const items = await transport.searchList({ query: 'ventas y más', maxResults: 10, signal: new AbortController().signal });
    expect(items).toHaveLength(1);
    const [url, init] = fetchMock.mock.calls[0];
    const parsed = new URL(String(url));
    expect(`${parsed.origin}${parsed.pathname}`).toBe('https://www.googleapis.com/youtube/v3/search');
    expect(Object.fromEntries(parsed.searchParams)).toEqual({
      part: 'snippet',
      type: 'video',
      q: 'ventas y más',
      maxResults: '10',
    });
    expect(parsed.searchParams.has('key')).toBe(false);
    expect(init?.headers).toEqual(expect.objectContaining({ 'x-goog-api-key': TEST_KEY }));
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  test('videos.list agrupa IDs en una consulta y solicita solo snippet,statistics', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ items: [
      { id: 'v1', statistics: { viewCount: '1' } },
      { id: 'v2', statistics: { viewCount: '2' } },
    ] }));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await transport.videosList({ videoIds: ['v1', 'v2'], signal: new AbortController().signal });
    const parsed = new URL(String(fetchMock.mock.calls[0][0]));
    expect(parsed.pathname).toBe('/youtube/v3/videos');
    expect(parsed.searchParams.get('part')).toBe('snippet,statistics');
    expect(parsed.searchParams.get('id')).toBe('v1,v2');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('provider realiza como máximo search.list + videos.list y no pagina', async () => {
    const fetchMock = sequentialFetch(jsonResponse(successSearch()), jsonResponse(successVideos()));
    const provider = new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
      maxResults: 10,
    });
    const result = await provider.scrapeHashtag('ventas');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual(expect.objectContaining({ totalPosts: 1, sampleSize: 1, cached: false }));
    expect(result.topPosts[0]).toEqual(expect.objectContaining({
      id: 'video-1',
      text: 'Título observado',
      description: 'Descripción pública',
      channelId: 'channel-1',
      channelTitle: 'Canal público',
      views: 100,
      likes: 4,
      comments: 1,
      engagement: 5,
    }));
  });

  test('ignora pageInfo.totalResults y totalPosts representa solo la muestra', async () => {
    const fetchMock = sequentialFetch(jsonResponse(successSearch(999999)), jsonResponse(successVideos()));
    const result = await new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
    }).scrapeHashtag('ventas');
    expect(result.totalPosts).toBe(1);
    expect(result.observed.postCount).toBe(1);
    expect(result.sampleSize).toBe(1);
  });

  test('búsqueda vacía no llama videos.list', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ pageInfo: { totalResults: 0 }, items: [] }));
    const result = await new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
    }).scrapeHashtag('ventas');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ totalPosts: 0, sampleSize: 0, avgEngagement: 0 }));
  });

  test.each([
    ['sin likes', { viewCount: '100', commentCount: '5' }, { views: 100, likes: undefined, comments: 5, engagement: 5 }],
    ['sin comments', { viewCount: '100', likeCount: '4' }, { views: 100, likes: 4, comments: undefined, engagement: 4 }],
    ['views cero', { viewCount: '0', likeCount: '4', commentCount: '1' }, { views: 0, likes: 4, comments: 1, engagement: 0 }],
    ['statistics ausente', null, { views: undefined, likes: undefined, comments: undefined, engagement: 0 }],
  ])('normaliza datos parciales: %s', async (_label, statistics, expected) => {
    const fetchMock = sequentialFetch(jsonResponse(successSearch()), jsonResponse(successVideos(statistics)));
    const result = await new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
    }).scrapeHashtag('ventas');
    expect(result.topPosts[0]).toEqual(expect.objectContaining(expected));
    expect(Number.isFinite(result.avgEngagement)).toBe(true);
  });

  test('limita maxResults a 10 incluso si el caller solicita más', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ items: [] }));
    const provider = new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
      maxResults: 500,
    });
    await provider.scrapeHashtag('ventas');
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('maxResults')).toBe('10');
  });

  test('Unicode y query normalizada se codifican correctamente', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ items: [] }));
    const provider = new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
    });
    await provider.scrapeHashtag('niñez');
    expect(new URL(String(fetchMock.mock.calls[0][0])).searchParams.get('q')).toBe('niñez');
  });

  test('respuesta estructuralmente inválida se sanitiza', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ pageInfo: {} }));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await expect(transport.searchList({ query: 'ventas', maxResults: 10, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE', status: 502 });
  });

  test('JSON inválido se mapea a PROVIDER_INVALID_RESPONSE', async () => {
    const fetchMock = sequentialFetch(new Response('{not-json', { status: 200 }));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await expect(transport.searchList({ query: 'ventas', maxResults: 10, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'PROVIDER_INVALID_RESPONSE', status: 502 });
  });

  test.each([
    [400, 'badRequest', 'PROVIDER_UPSTREAM_ERROR', 502],
    [403, 'keyInvalid', 'CONFIGURATION_ERROR', 503],
    [403, 'accessNotConfigured', 'CONFIGURATION_ERROR', 503],
    [403, 'quotaExceeded', 'PROVIDER_RATE_LIMIT', 429],
    [403, 'dailyLimitExceeded', 'PROVIDER_RATE_LIMIT', 429],
    [403, 'rateLimitExceeded', 'PROVIDER_RATE_LIMIT', 429],
    [429, 'unknown', 'PROVIDER_RATE_LIMIT', 429],
    [500, 'backendError', 'PROVIDER_UPSTREAM_ERROR', 502],
  ])('HTTP %i reason=%s se mapea a %s', async (httpStatus, reason, code, status) => {
    const fetchMock = sequentialFetch(googleError(httpStatus, reason));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await expect(transport.searchList({ query: 'ventas', maxResults: 10, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code, status });
  });

  test.each([
    [400, 'API_KEY_INVALID', 'INVALID_ARGUMENT', 'CONFIGURATION_ERROR', 'API_KEY_INVALID'],
    [403, 'SERVICE_DISABLED', 'PERMISSION_DENIED', 'CONFIGURATION_ERROR', 'API_DISABLED'],
    [403, 'API_KEY_SERVICE_BLOCKED', 'PERMISSION_DENIED', 'CONFIGURATION_ERROR', 'API_KEY_RESTRICTED'],
    [403, 'QUOTA_EXCEEDED', 'RESOURCE_EXHAUSTED', 'PROVIDER_RATE_LIMIT', 'QUOTA_EXCEEDED'],
    [403, 'PERMISSION_DENIED', 'PERMISSION_DENIED', 'CONFIGURATION_ERROR', 'ACCESS_DENIED'],
    [400, 'SOME_INVALID_PARAMETER', 'INVALID_ARGUMENT', 'PROVIDER_UPSTREAM_ERROR', 'INVALID_REQUEST'],
    [404, 'UNRECOGNIZED_REASON', 'NOT_FOUND', 'PROVIDER_UPSTREAM_ERROR', 'UPSTREAM_REJECTED'],
  ])('diagnóstico moderno HTTP %i reason=%s se sanitiza como %s', async (
    httpStatus,
    reason,
    googleStatus,
    code,
    diagnosticReason
  ) => {
    const fetchMock = sequentialFetch(modernGoogleError(httpStatus, reason, googleStatus));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    let captured: ScraperError | undefined;
    try {
      await transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal });
    } catch (error) {
      captured = error as ScraperError;
    }
    expect(captured).toMatchObject({
      code,
      diagnostic: { provider: 'youtube', httpStatus, reason: diagnosticReason },
    });
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(TEST_KEY);
    expect(serialized).not.toContain('metadata');
    expect(serialized).not.toContain('googleapis.com');
    expect(serialized).not.toContain('sensitive upstream message');
  });

  test.each([
    [403, 'keyInvalid', 'API_KEY_INVALID'],
    [403, 'accessNotConfigured', 'API_DISABLED'],
    [403, 'ipRefererBlocked', 'API_KEY_RESTRICTED'],
    [403, 'quotaExceeded', 'QUOTA_EXCEEDED'],
    [403, 'forbidden', 'ACCESS_DENIED'],
  ])('diagnóstico legacy HTTP %i reason=%s conserva solo categoría permitida', async (
    httpStatus,
    reason,
    diagnosticReason
  ) => {
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, sequentialFetch(googleError(httpStatus, reason)));
    await expect(transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal }))
      .rejects.toMatchObject({ diagnostic: { provider: 'youtube', httpStatus, reason: diagnosticReason } });
  });

  test('HTTP 429 sin cuerpo utilizable conserva diagnóstico de cuota', async () => {
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, sequentialFetch(jsonResponse({}, 429)));
    await expect(transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal }))
      .rejects.toMatchObject({
        code: 'PROVIDER_RATE_LIMIT',
        diagnostic: { provider: 'youtube', httpStatus: 429, reason: 'QUOTA_EXCEEDED' },
      });
  });

  test('timeout aborta fetch simulado y produce PROVIDER_TIMEOUT', async () => {
    const fetchMock = jest.fn((_input: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    })) as FetchMock;
    const provider = new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
      timeoutMs: 5,
    });
    await expect(provider.scrapeHashtag('ventas')).rejects.toMatchObject({ code: 'PROVIDER_TIMEOUT', status: 504 });
    expect((fetchMock.mock.calls[0][1]?.signal as AbortSignal).aborted).toBe(true);
  });

  test('configuración ausente falla antes de cualquier request', () => {
    expect(() => new YouTubeHttpScraperTransport('', unexpectedFetch as unknown as typeof fetch))
      .toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', status: 503 }));
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  test.each([
    ['espacio inicial', ` ${TEST_KEY}`],
    ['espacio final', `${TEST_KEY} `],
    ['tabulación', `${TEST_KEY}\t`],
    ['retorno de carro', `${TEST_KEY}\r`],
    ['salto de línea', `${TEST_KEY}\n`],
    ['carácter de control', `${TEST_KEY}\u0001`],
    ['Unicode', `${TEST_KEY}ñ`],
    ['puntuación no permitida', `${TEST_KEY}.`],
  ])('rechaza clave ficticia con %s antes de cualquier request', (_label, invalidKey) => {
    expect(() => new YouTubeHttpScraperTransport(invalidKey, unexpectedFetch as unknown as typeof fetch))
      .toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
    expect(unexpectedFetch).not.toHaveBeenCalled();
  });

  test('conserva exactamente una clave ficticia canónica en x-goog-api-key', async () => {
    const exactKey = 'AIzaSy_Fictitious-Key-1234567890';
    const fetchMock = sequentialFetch(jsonResponse({ items: [] }));
    const transport = new YouTubeHttpScraperTransport(exactKey, fetchMock);
    await transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal });
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual(expect.objectContaining({
      'x-goog-api-key': exactKey,
    }));
  });

  test('fetch ausente falla como configuración inválida', () => {
    expect(() => new YouTubeHttpScraperTransport(TEST_KEY, null as unknown as typeof fetch))
      .toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR', status: 503 }));
  });

  test('credencial no aparece en resultados, errores ni logs', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const successFetch = sequentialFetch(jsonResponse(successSearch()), jsonResponse(successVideos()));
    const result = await new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, successFetch),
    }).scrapeHashtag('ventas');
    expect(JSON.stringify(result)).not.toContain(TEST_KEY);

    const failureFetch = sequentialFetch(googleError(403, 'keyInvalid'));
    let error: ScraperError;
    try {
      await new YouTubeHttpScraperTransport(TEST_KEY, failureFetch)
        .searchList({ query: 'ventas', maxResults: 10, signal: new AbortController().signal });
      throw new Error('Expected request to fail');
    } catch (value) {
      error = value as ScraperError;
    }
    expect(JSON.stringify({ message: error.message, code: error.code })).not.toContain(TEST_KEY);
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  test('providerFactory lee exclusivamente la variable backend sin ejecutar red', () => {
    const previousKey = process.env.YOUTUBE_SCRAPER_API_KEY;
    const previousMode = process.env.SOCIAL_SCRAPER_MODE;
    process.env.YOUTUBE_SCRAPER_API_KEY = TEST_KEY;
    process.env.SOCIAL_SCRAPER_MODE = 'live';
    const provider = createScraperProvider();
    expect(provider).toBeInstanceOf(YouTubeScraperProvider);
    expect(unexpectedFetch).not.toHaveBeenCalled();
    if (previousKey === undefined) delete process.env.YOUTUBE_SCRAPER_API_KEY;
    else process.env.YOUTUBE_SCRAPER_API_KEY = previousKey;
    if (previousMode === undefined) delete process.env.SOCIAL_SCRAPER_MODE;
    else process.env.SOCIAL_SCRAPER_MODE = previousMode;
  });

  test('credencial backend no aparece en código, env ni bundle fuente del frontend', () => {
    const frontendRoot = join(__dirname, '..', '..', 'frontend');
    const frontendFiles = [
      ...filesUnder(join(frontendRoot, 'src')),
      join(frontendRoot, '.env.example'),
    ];
    const frontendText = frontendFiles.map(file => readFileSync(file, 'utf8')).join('\n');
    expect(frontendText).not.toContain('YOUTUBE_SCRAPER_API_KEY');
    expect(frontendText).not.toContain(TEST_KEY);
  });

  test('Blueprint declara secreto externo y mantiene demo como default', () => {
    const blueprint = readFileSync(join(__dirname, '..', '..', 'render.yaml'), 'utf8');
    expect(blueprint).toMatch(/key: SOCIAL_SCRAPER_MODE\s+[\s\S]*?value: demo/);
    expect(blueprint).toMatch(/key: YOUTUBE_SCRAPER_API_KEY\s+[\s\S]*?sync: false/);
    expect(blueprint).not.toContain(TEST_KEY);
  });

  test('modo live no cae a demo y modo demo permanece compatible', async () => {
    const previousKey = process.env.YOUTUBE_SCRAPER_API_KEY;
    delete process.env.YOUTUBE_SCRAPER_API_KEY;
    expect(() => createScraperProvider({ mode: 'live', youtube: { apiKey: undefined } }))
      .toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
    if (previousKey !== undefined) process.env.YOUTUBE_SCRAPER_API_KEY = previousKey;
    const demo = createScraperProvider({ mode: 'demo' });
    await expect(demo.scrapeHashtag('ventas')).resolves.toMatchObject({ mode: 'demo', totalPosts: 1240 });
    await expect(demo.scrapeProfile({ username: 'alma', platform: 'youtube' })).resolves.toMatchObject({ mode: 'demo' });
  });

  test('profile live permanece fuera de alcance de forma controlada', async () => {
    const provider = new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, sequentialFetch()),
    });
    await expect(provider.scrapeProfile({ username: 'alma', platform: 'youtube' }))
      .rejects.toMatchObject({ code: 'CONFIGURATION_ERROR', status: 503 });
  });

  test('no carga módulos operativos ni usa fetch global', async () => {
    const fetchMock = sequentialFetch(jsonResponse({ items: [] }));
    await new YouTubeScraperProvider({
      apiKey: TEST_KEY,
      transport: new YouTubeHttpScraperTransport(TEST_KEY, fetchMock),
    }).scrapeHashtag('ventas');
    expect(unexpectedFetch).not.toHaveBeenCalled();
    const loaded = Object.keys(require.cache).join('\n');
    expect(loaded).not.toMatch(/AutomationEngineService|MessagingService|YouTubeIngestionService|YouTubeService|CrmService/);
  });
});
