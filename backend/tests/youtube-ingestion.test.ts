import { YouTubeIngestionService } from '../src/services/YouTubeIngestionService';

describe('YouTubeIngestionService polling cursor', () => {
  const originalOverlap = process.env.YOUTUBE_POLL_OVERLAP_MS;

  afterEach(() => {
    if (originalOverlap === undefined) delete process.env.YOUTUBE_POLL_OVERLAP_MS;
    else process.env.YOUTUBE_POLL_OVERLAP_MS = originalOverlap;
  });

  test('overlaps polls so eventually-consistent comments are not skipped', () => {
    process.env.YOUTUBE_POLL_OVERLAP_MS = '600000';
    const connectedAt = new Date('2026-08-08T17:00:00.000Z');
    const lastPolledAt = new Date('2026-08-08T18:00:00.000Z');
    expect(YouTubeIngestionService.getPollingCutoff({ connectedAt, lastPolledAt }))
      .toBe(new Date('2026-08-08T17:50:00.000Z').getTime());
  });

  test('never imports comments from before the channel connection', () => {
    process.env.YOUTUBE_POLL_OVERLAP_MS = '600000';
    const connectedAt = new Date('2026-08-08T17:58:00.000Z');
    const lastPolledAt = new Date('2026-08-08T18:00:00.000Z');
    expect(YouTubeIngestionService.getPollingCutoff({ connectedAt, lastPolledAt }))
      .toBe(connectedAt.getTime());
  });
});
