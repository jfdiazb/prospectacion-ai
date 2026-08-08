import { YouTubeIngestionService } from '../src/services/YouTubeIngestionService';

describe('YouTubeIngestionService polling cursor', () => {
  const originalOverlap = process.env.YOUTUBE_POLL_OVERLAP_MS;
  const originalReplyInterval = process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS;

  afterEach(() => {
    if (originalOverlap === undefined) delete process.env.YOUTUBE_POLL_OVERLAP_MS;
    else process.env.YOUTUBE_POLL_OVERLAP_MS = originalOverlap;
    if (originalReplyInterval === undefined) delete process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS;
    else process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS = originalReplyInterval;
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

  test('polls replies on a separate quota-conscious interval', () => {
    process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS = '120000';
    const now = new Date('2026-08-08T18:02:00.000Z').getTime();
    expect(YouTubeIngestionService.shouldPollReplies({ lastRepliesPolledAt: new Date('2026-08-08T18:00:01.000Z') }, now)).toBe(false);
    expect(YouTubeIngestionService.shouldPollReplies({ lastRepliesPolledAt: new Date('2026-08-08T18:00:00.000Z') }, now)).toBe(true);
  });

  test('reads every reply page and keeps responses attached to the root thread', async () => {
    const http = { get: jest.fn()
      .mockResolvedValueOnce({ data: { items: [{ id: 'reply-2', snippet: { textOriginal: 'Segundo', authorChannelId: { value: 'lead-1' }, publishedAt: '2026-08-08T18:02:00.000Z' } }], nextPageToken: 'page-2' } })
      .mockResolvedValueOnce({ data: { items: [{ id: 'reply-1', snippet: { textOriginal: 'Primero', authorChannelId: { value: 'lead-1' }, publishedAt: '2026-08-08T18:01:00.000Z' } }] } }) } as any;
    const service = new YouTubeIngestionService(http);
    const process = jest.spyOn(service, 'processComment').mockResolvedValue(undefined);

    await service.pollThreadReplies({ userId: { toString: () => 'owner-1' }, channelId: 'channel-owner' }, 'token-1', 'root-comment');

    expect(http.get).toHaveBeenCalledTimes(2);
    expect(http.get.mock.calls[1][0]).toContain('pageToken=page-2');
    expect(process).toHaveBeenNthCalledWith(1, 'owner-1', expect.objectContaining({ id: 'reply-2' }), 'root-comment', 'channel-owner');
    expect(process).toHaveBeenNthCalledWith(2, 'owner-1', expect.objectContaining({ id: 'reply-1' }), 'root-comment', 'channel-owner');
  });
});
