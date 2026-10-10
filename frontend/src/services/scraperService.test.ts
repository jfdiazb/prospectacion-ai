import { describe, expect, test, vi } from 'vitest';
import { apiClient } from './api';
import { scraperService } from './scraperService';

vi.mock('./api', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

describe('scraperService status', () => {
  test('shares one read-only status request across consumers', async () => {
    vi.mocked(apiClient.get).mockResolvedValue({
      data: { success: true, message: 'ok', data: { mode: 'live' } },
    });

    const [first, second] = await Promise.all([scraperService.status(), scraperService.status()]);

    expect(apiClient.get).toHaveBeenCalledTimes(1);
    expect(apiClient.get).toHaveBeenCalledWith('/social-scraper/status');
    expect(first.data?.mode).toBe('live');
    expect(second).toBe(first);
  });
});
