import type { AxiosInstance } from 'axios';
import { AxiosError } from 'axios';
import { ZoomProvider } from '../src/integrations/meetings/ZoomProvider';

describe('ZoomProvider', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv, ZOOM_CLIENT_ID: 'client-id', ZOOM_CLIENT_SECRET: 'client-secret', ZOOM_ACCOUNT_ID: 'account-id', ZOOM_USER_ID: 'host@example.com', ZOOM_TIMEOUT_MS: '5000' };
    ZoomProvider.clearTokenCache();
  });
  afterAll(() => { process.env = originalEnv; });

  test('gets an S2S token and creates a meeting', async () => {
    const post = jest.fn()
      .mockResolvedValueOnce({ data: { access_token: 'zoom-test-token', expires_in: 3600, api_url: 'https://api.zoom.us' } })
      .mockResolvedValueOnce({ data: { id: 987654321, join_url: 'https://zoom.us/j/987654321', start_time: '2026-08-07T15:00:00Z' } });
    const provider = new ZoomProvider({ post } as unknown as AxiosInstance);
    const result = await provider.createMeeting({ topic: 'ALMA', timezone: 'America/Bogota', scheduledFor: new Date('2026-08-07T15:00:00Z') });
    expect(result).toMatchObject({ externalId: '987654321', joinUrl: 'https://zoom.us/j/987654321', simulated: false });
    expect(post).toHaveBeenNthCalledWith(1, 'https://zoom.us/oauth/token', 'grant_type=account_credentials&account_id=account-id', expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Basic /) }) }));
    expect(post).toHaveBeenNthCalledWith(2, 'https://api.zoom.us/v2/users/host%40example.com/meetings', expect.objectContaining({ topic: 'ALMA', type: 2, timezone: 'America/Bogota', start_time: '2026-08-07T10:00:00' }), expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer zoom-test-token' }) }));
  });

  test('reuses the cached OAuth token', async () => {
    const post = jest.fn().mockResolvedValueOnce({ data: { access_token: 'cached-token', expires_in: 3600 } })
      .mockResolvedValueOnce({ data: { id: 1, join_url: 'https://zoom.us/j/1' } })
      .mockResolvedValueOnce({ data: { id: 2, join_url: 'https://zoom.us/j/2' } });
    const provider = new ZoomProvider({ post } as unknown as AxiosInstance);
    await provider.createMeeting({ topic: 'Uno', timezone: 'America/Bogota' });
    await provider.createMeeting({ topic: 'Dos', timezone: 'America/Bogota' });
    expect(post).toHaveBeenCalledTimes(3);
  });

  test('maps Zoom authentication errors', async () => {
    const error = new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', undefined, undefined, { status: 401, data: { code: 124, message: 'Invalid access token.' } } as any);
    const provider = new ZoomProvider({ post: jest.fn().mockRejectedValue(error) } as unknown as AxiosInstance);
    await expect(provider.createMeeting({ topic: 'ALMA', timezone: 'America/Bogota' })).rejects.toMatchObject({ code: '124', status: 401 });
  });

  test('maps timeouts and invalid meeting responses', async () => {
    const timeout = new AxiosError('timeout', 'ECONNABORTED');
    const timeoutProvider = new ZoomProvider({ post: jest.fn().mockRejectedValue(timeout) } as unknown as AxiosInstance);
    await expect(timeoutProvider.createMeeting({ topic: 'ALMA', timezone: 'America/Bogota' })).rejects.toMatchObject({ code: 'ZOOM_TIMEOUT' });

    ZoomProvider.clearTokenCache();
    const post = jest.fn().mockResolvedValueOnce({ data: { access_token: 'token', expires_in: 3600 } }).mockResolvedValueOnce({ data: {} });
    const invalidProvider = new ZoomProvider({ post } as unknown as AxiosInstance);
    await expect(invalidProvider.createMeeting({ topic: 'ALMA', timezone: 'America/Bogota' })).rejects.toMatchObject({ code: 'ZOOM_INVALID_MEETING_RESPONSE' });
  });
});
