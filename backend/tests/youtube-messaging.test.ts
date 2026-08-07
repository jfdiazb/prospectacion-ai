import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { YouTubeMessagingProvider } from '../src/integrations/messaging/YouTubeMessagingProvider';
import { getMessagingProvider } from '../src/integrations/messaging';

describe('YouTubeMessagingProvider', () => {
  const originalEnv = process.env;
  beforeEach(() => { process.env = { ...originalEnv, YOUTUBE_ACCESS_TOKEN: 'youtube-test-token', YOUTUBE_MESSAGING_MODE: 'mock' }; });
  afterAll(() => { process.env = originalEnv; });

  test('YouTube uses mock mode by default without network access', () => {
    expect(getMessagingProvider('youtube').name).toBe('mock');
  });

  test('builds the official comments.insert reply request', async () => {
    const post = jest.fn().mockResolvedValue({ data: { id: 'youtube-reply-1' } });
    const provider = new YouTubeMessagingProvider({ post } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Gracias por comentar', recipient: { type: 'youtube_comment', parentCommentId: 'parent-comment-1' } }))
      .resolves.toEqual({ externalMessageId: 'youtube-reply-1', simulated: false });
    expect(post).toHaveBeenCalledWith('https://www.googleapis.com/youtube/v3/comments?part=snippet',
      { snippet: { parentId: 'parent-comment-1', textOriginal: 'Gracias por comentar' } },
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer youtube-test-token' }) }));
  });

  test('rejects invalid responses', async () => {
    const provider = new YouTubeMessagingProvider({ post: jest.fn().mockResolvedValue({ data: {} }) } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'youtube_comment', parentCommentId: 'comment-1' } }))
      .rejects.toMatchObject({ code: 'YOUTUBE_INVALID_RESPONSE' });
  });

  test('maps YouTube timeouts', async () => {
    const provider = new YouTubeMessagingProvider({ post: jest.fn().mockRejectedValue(new AxiosError('timeout', 'ECONNABORTED')) } as unknown as AxiosInstance);
    await expect(provider.sendMessage({ text: 'Hola', recipient: { type: 'youtube_comment', parentCommentId: 'comment-1' } }))
      .rejects.toMatchObject({ code: 'YOUTUBE_TIMEOUT' });
  });
});
