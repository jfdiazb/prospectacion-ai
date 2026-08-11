import { YouTubeMonitorService } from '../src/services/YouTubeMonitorService';

describe('YouTubeMonitorService', () => {
  test('uses quota-conscious defaults', () => {
    const previous = process.env.YOUTUBE_REPLY_MAX_THREADS;
    delete process.env.YOUTUBE_REPLY_MAX_THREADS;
    expect(YouTubeMonitorService.getConfig()).toEqual(expect.objectContaining({ maxThreads: 8, activeDays: 7, intervalMs: 120000 }));
    if (previous !== undefined) process.env.YOUTUBE_REPLY_MAX_THREADS = previous;
  });

  test('warns when active conversations exceed immediate coverage', () => {
    const alerts = YouTubeMonitorService.buildAlerts(11, 8, new Date());
    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thread_capacity', severity: 'warning' })]));
  });

  test('does not allow a stale deployment value to reduce coverage below eight threads', () => {
    const previous = process.env.YOUTUBE_REPLY_MAX_THREADS;
    process.env.YOUTUBE_REPLY_MAX_THREADS = '5';
    expect(YouTubeMonitorService.getConfig().maxThreads).toBe(8);
    if (previous === undefined) delete process.env.YOUTUBE_REPLY_MAX_THREADS;
    else process.env.YOUTUBE_REPLY_MAX_THREADS = previous;
  });
});
