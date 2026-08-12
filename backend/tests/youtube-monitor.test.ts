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

  test('classifies OAuth, quota and network failures without exposing messages', () => {
    expect(YouTubeMonitorService.errorCategory('quotaExceeded')).toBe('quota');
    expect(YouTubeMonitorService.errorCategory('authError')).toBe('oauth');
    expect(YouTubeMonitorService.errorCategory('YOUTUBE_TIMEOUT')).toBe('network');
    expect(YouTubeMonitorService.summarizeErrors([{ errorCode: 'quotaExceeded' }, { errorCode: 'authError' }])).toEqual({ oauth: 1, quota: 1, network: 0, api: 0 });
  });

  test('alerts when ALMA leaves conversations unanswered', () => {
    const alerts = YouTubeMonitorService.buildAlerts(1, 8, new Date(), 2, 0);
    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'alma_unanswered', severity: 'error' })]));
  });

  test('reports isolated thread polling failures', () => {
    const alerts = YouTubeMonitorService.buildAlerts(8, 8, new Date(), 0, 0, 2);
    expect(alerts).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'thread_polling_failures', severity: 'warning' })]));
  });
});
