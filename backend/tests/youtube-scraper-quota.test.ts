import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import YouTubeQuotaUsage from '../src/models/YouTubeQuotaUsage';
import { createScraperProvider } from '../src/scraper/providerFactory';
import { YouTubeHttpScraperTransport } from '../src/scraper/providers/YouTubeHttpScraperTransport';
import {
  YouTubeScraperQuotaBudget,
  youtubeQuotaDay,
  youtubeScraperDailyBudget,
} from '../src/scraper/YouTubeScraperQuotaBudget';

const TEST_KEY = 'AIzaSy_Fictitious-Key-1234567890';

describe('YouTube Social Scraper durable quota budget', () => {
  let mongo: MongoMemoryServer;
  const originalBudget = process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await YouTubeQuotaUsage.syncIndexes();
  });

  beforeEach(async () => {
    process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET = '500';
    await YouTubeQuotaUsage.deleteMany({});
  });

  afterEach(() => jest.restoreAllMocks());

  afterAll(async () => {
    if (originalBudget === undefined) delete process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET;
    else process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET = originalBudget;
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('falla cerrado si el presupuesto falta o es inválido', () => {
    delete process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET;
    expect(() => youtubeScraperDailyBudget()).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
    process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET = 'ilimitado';
    expect(() => youtubeScraperDailyBudget()).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
    process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET = '99';
    expect(() => youtubeScraperDailyBudget()).toThrow(expect.objectContaining({ code: 'CONFIGURATION_ERROR' }));
  });

  test('reserva antes del límite y bloquea sin superarlo', async () => {
    process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET = '201';
    await YouTubeScraperQuotaBudget.reserve(100);
    await YouTubeScraperQuotaBudget.reserve(1);
    await YouTubeScraperQuotaBudget.reserve(100);
    await expect(YouTubeScraperQuotaBudget.reserve(1)).rejects.toMatchObject({ code: 'PROVIDER_RATE_LIMIT' });
    const usage = await YouTubeQuotaUsage.findOne({ scopeId: 'social-scraper:global' }).lean();
    expect(usage).toMatchObject({ generalUnits: 201, searchCalls: 2 });
  });

  test('reservas concurrentes nunca exceden el presupuesto global', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => YouTubeScraperQuotaBudget.reserve(100))
    );
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(5);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(5);
    const usage = await YouTubeQuotaUsage.findOne({ scopeId: 'social-scraper:global' }).lean();
    expect(usage?.generalUnits).toBe(500);
  });

  test('el consumo persiste entre instancias lógicas del servicio', async () => {
    await YouTubeScraperQuotaBudget.reserve(100);
    const firstSnapshot = await YouTubeQuotaUsage.findOne({ scopeId: 'social-scraper:global' }).lean();
    expect(firstSnapshot?.generalUnits).toBe(100);
    await YouTubeScraperQuotaBudget.reserve(100);
    const afterRestartEquivalent = await YouTubeQuotaUsage.findOne({ scopeId: 'social-scraper:global' }).lean();
    expect(afterRestartEquivalent?.generalUnits).toBe(200);
  });

  test('usa el día de cuota de YouTube en America/Los_Angeles', () => {
    expect(youtubeQuotaDay(new Date('2026-01-01T07:59:59Z'))).toBe('2025-12-31');
    expect(youtubeQuotaDay(new Date('2026-01-01T08:00:00Z'))).toBe('2026-01-01');
    expect(youtubeQuotaDay(new Date('2026-07-01T06:59:59Z'))).toBe('2026-06-30');
    expect(youtubeQuotaDay(new Date('2026-07-01T07:00:00Z'))).toBe('2026-07-01');
  });

  test('un fallo HTTP conserva la reserva estimada y no reintenta automáticamente', async () => {
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ error: { errors: [{ reason: 'backendError' }] } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    }));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await expect(transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal }))
      .rejects.toMatchObject({ code: 'PROVIDER_UPSTREAM_ERROR' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const usage = await YouTubeQuotaUsage.findOne({ scopeId: 'social-scraper:global' }).lean();
    expect(usage).toMatchObject({ generalUnits: 100, searchCalls: 1 });
  });

  test('un fallo de persistencia bloquea red y una llamada posterior puede recuperarse', async () => {
    const original = YouTubeQuotaUsage.updateOne.bind(YouTubeQuotaUsage);
    const updateSpy = jest.spyOn(YouTubeQuotaUsage, 'updateOne').mockRejectedValueOnce(new Error('mongo unavailable'));
    const fetchMock = jest.fn(async () => new Response(JSON.stringify({ items: [] }), { status: 200 }));
    const transport = new YouTubeHttpScraperTransport(TEST_KEY, fetchMock);
    await expect(transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal }))
      .rejects.toThrow('mongo unavailable');
    expect(fetchMock).not.toHaveBeenCalled();
    updateSpy.mockImplementation(original as typeof YouTubeQuotaUsage.updateOne);
    await expect(transport.searchList({ query: 'ventas', maxResults: 1, signal: new AbortController().signal }))
      .resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('DEMO no crea ni consulta el ledger de cuota', async () => {
    delete process.env.YOUTUBE_SCRAPER_DAILY_QUOTA_BUDGET;
    const provider = createScraperProvider({ mode: 'demo' });
    await expect(provider.scrapeHashtag('ventas')).resolves.toMatchObject({ mode: 'demo' });
    expect(await YouTubeQuotaUsage.countDocuments()).toBe(0);
  });
});
