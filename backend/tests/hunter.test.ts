import YouTubeQuotaUsage from '../src/models/YouTubeQuotaUsage';
import HunterSearchCache from '../src/models/HunterSearchCache';
import { HunterService } from '../src/services/HunterService';

describe('HunterService', () => {
  const previousMode = process.env.YOUTUBE_HUNTER_MODE;

  beforeEach(() => {
    process.env.YOUTUBE_HUNTER_MODE = 'mock';
    jest.spyOn(YouTubeQuotaUsage, 'findOne').mockReturnValue({ lean: async () => null } as any);
    jest.spyOn(HunterSearchCache, 'findOne').mockReturnValue({ lean: async () => null } as any);
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => {
    if (previousMode === undefined) delete process.env.YOUTUBE_HUNTER_MODE;
    else process.env.YOUTUBE_HUNTER_MODE = previousMode;
  });

  test('does not call YouTube while Hunter is in mock mode', async () => {
    const http = { get: jest.fn() } as any;
    const result = await HunterService.searchProfiles({ keyword: 'ventas', type: 'channel' }, '507f1f77bcf86cd799439011', http);
    expect(result.results[0]).toEqual(expect.objectContaining({ platform: 'youtube', kind: 'channel' }));
    expect(http.get).not.toHaveBeenCalled();
  });

  test('rejects empty and oversized searches before consuming quota', async () => {
    await expect(HunterService.searchProfiles({ keyword: ' ' }, '507f1f77bcf86cd799439011')).rejects.toThrow('entre 2 y 100');
    await expect(HunterService.searchProfiles({ keyword: 'x'.repeat(101) }, '507f1f77bcf86cd799439011')).rejects.toThrow('entre 2 y 100');
  });

  test('allows the single current CRM operator up to 25 searches by default', async () => {
    const previous = process.env.YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT;
    delete process.env.YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT;
    await expect(HunterService.quotaStatus('507f1f77bcf86cd799439011')).resolves.toEqual(expect.objectContaining({ userSearchLimit: 25, projectSearchLimit: 100 }));
    if (previous !== undefined) process.env.YOUTUBE_HUNTER_USER_DAILY_SEARCH_LIMIT = previous;
  });
});
