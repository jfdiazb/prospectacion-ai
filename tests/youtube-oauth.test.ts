import { YouTubeOAuthService } from '../src/integrations/youtube/YouTubeOAuthService';
import { YouTubeTokenService } from '../src/integrations/youtube/YouTubeTokenService';
import { YouTubeController } from '../src/controllers/YouTubeController';
import YouTubeCredential from '../src/models/YouTubeCredential';

describe('YouTube OAuth security', () => {
  const originalEnv = process.env;
  beforeEach(() => {
    process.env = { ...originalEnv,
      YOUTUBE_CLIENT_ID: 'client-id', YOUTUBE_OAUTH_REDIRECT_URI: 'https://api.example.com/api/v1/youtube/oauth/callback',
      YOUTUBE_OAUTH_STATE_SECRET: 'state-secret-with-at-least-32-characters',
      YOUTUBE_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
    };
  });
  afterAll(() => { process.env = originalEnv; });

  test('encrypts tokens with authenticated encryption and decrypts them', () => {
    const service = new YouTubeTokenService();
    const encrypted = service.encrypt('refresh-token-secret');
    expect(encrypted.ciphertext).not.toContain('refresh-token-secret');
    expect(service.decrypt(encrypted)).toBe('refresh-token-secret');
    expect(() => service.decrypt({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') })).toThrow();
  });

  test('signs OAuth state and rejects tampering', () => {
    const state = YouTubeOAuthService.createState('507f1f77bcf86cd799439011');
    expect(YouTubeOAuthService.verifyState(state)).toBe('507f1f77bcf86cd799439011');
    expect(() => YouTubeOAuthService.verifyState(`${state}x`)).toThrow('Firma OAuth inválida');
  });

  test('builds offline consent URL with the minimum YouTube scope', () => {
    const url = new URL(YouTubeOAuthService.authorizationUrl('507f1f77bcf86cd799439011'));
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.force-ssl');
  });

  test('status marks an invalid OAuth grant as requiring reconnection without exposing failure details', async () => {
    const findOne = jest.spyOn(YouTubeCredential, 'findOne').mockReturnValue({
      select: () => ({
        lean: async () => ({
          channelId: 'channel-1',
          channelTitle: 'Controlled channel',
          connectedAt: new Date('2026-08-01T00:00:00Z'),
          lastPollingFailure: { operation: 'oauth_refresh', reason: 'invalid_grant' },
        }),
      }),
    } as any);
    process.env.NODE_ENV = 'production';
    process.env.YOUTUBE_INGESTION_MODE = 'live';
    process.env.YOUTUBE_MESSAGING_MODE = 'live';
    delete process.env.YOUTUBE_POLLING_ENABLED;
    delete process.env.REAL_OUTBOUND_ENABLED;
    const json = jest.fn();
    await YouTubeController.status({ userId: 'owner-1' } as any, { json } as any, jest.fn());
    expect(json).toHaveBeenCalledWith({ success: true, data: expect.objectContaining({
      connected: false,
      reconnectRequired: true,
      pollingEnabled: false,
      inboundMode: 'live',
      outboundMode: 'mock',
    }) });
    expect(JSON.stringify(json.mock.calls[0][0])).not.toContain('invalid_grant');
    findOne.mockRestore();
  });

  test('resolves and persists an explicitly selected monitored channel by handle', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: { items: [{
      id: 'UC100mentalmente00000001',
      snippet: { title: '100 % Mentalmente', customUrl: '@100mentalmente6' },
    }] } }) } as any;
    const service = new YouTubeTokenService(http);
    jest.spyOn(service, 'getAccessToken').mockResolvedValue('access-token');
    const update = jest.spyOn(YouTubeCredential, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

    const selected = await service.selectMonitoredChannel('owner-1', 'https://youtube.com/@100mentalmente6');

    expect(selected.id).toBe('UC100mentalmente00000001');
    expect(http.get.mock.calls[0][0]).toContain('forHandle=%40100mentalmente6');
    expect(update).toHaveBeenCalledWith({ userId: 'owner-1' }, expect.objectContaining({
      $set: expect.objectContaining({
        channelId: 'UC100mentalmente00000001',
        channelTitle: '100 % Mentalmente',
        channelHandle: '@100mentalmente6',
      }),
    }));
    update.mockRestore();
  });

  test('rejects invalid handles without contacting YouTube', async () => {
    const http = { get: jest.fn() } as any;
    await expect(new YouTubeTokenService(http).selectMonitoredChannel('owner-1', 'not a channel')).rejects.toThrow('Handle de YouTube inválido');
    expect(http.get).not.toHaveBeenCalled();
  });

  test('reconnecting OAuth refreshes the authorized identity without losing an explicit monitored channel', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: { items: [{
      id: 'UCauthorized000000000001',
      snippet: { title: 'soy_jfer', customUrl: '@soy_jfer' },
    }] } }) } as any;
    const service = new YouTubeTokenService(http);
    const find = jest.spyOn(YouTubeCredential, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => ({
        channelId: 'UCmonitored000000000001',
        channelTitle: '100 % Mentalmente',
        channelHandle: '@100mentalmente6',
        authorizedChannelId: 'UColdAuthorized000000001',
        connectedAt: new Date('2026-08-01T00:00:00Z'),
      }) }),
    } as any);
    const update = jest.spyOn(YouTubeCredential, 'findOneAndUpdate').mockResolvedValue({} as any);

    await service.saveAuthorization('owner-1', {
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
    });

    expect(update).toHaveBeenCalledWith({ userId: 'owner-1' }, expect.objectContaining({
      $set: expect.objectContaining({
        channelId: 'UCmonitored000000000001',
        channelTitle: '100 % Mentalmente',
        authorizedChannelId: 'UCauthorized000000000001',
        authorizedChannelTitle: 'soy_jfer',
      }),
    }), { upsert: true });
    find.mockRestore();
    update.mockRestore();
  });
});
