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

  test('reconnecting without a new refresh token preserves the durable token already stored', async () => {
    const http = { get: jest.fn().mockResolvedValue({ data: { items: [{
      id: 'UCauthorized000000000001', snippet: { title: 'Authorized' },
    }] } }) } as any;
    const service = new YouTubeTokenService(http);
    const find = jest.spyOn(YouTubeCredential, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => ({
        channelId: 'UCauthorized000000000001', authorizedChannelId: 'UCauthorized000000000001',
        refreshToken: service.encrypt('durable-refresh-token'),
      }) }),
    } as any);
    const update = jest.spyOn(YouTubeCredential, 'findOneAndUpdate').mockResolvedValue({} as any);

    await service.saveAuthorization('owner-1', { access_token: 'new-access-token', expires_in: 3600 });

    const mutation = update.mock.calls[0][1] as any;
    expect(mutation.$set.refreshToken).toBeUndefined();
    expect(mutation.$set.lastAuthorizedAt).toBeInstanceOf(Date);
    expect(mutation.$unset).toHaveProperty('lastTokenRefreshFailure');
    find.mockRestore();
    update.mockRestore();
  });

  test('coalesces concurrent refresh requests and persists one successful refresh', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: { access_token: 'refreshed-access', expires_in: 3600 } }) } as any;
    const service = new YouTubeTokenService(http);
    const refreshToken = service.encrypt('refresh-token');
    const expiredCredential = {
      _id: 'credential-1', accessTokenExpiresAt: new Date(0),
      accessToken: { toObject: () => service.encrypt('expired-access') },
      refreshToken: { toObject: () => refreshToken },
    };
    const find = jest.spyOn(YouTubeCredential, 'findOne').mockResolvedValue(expiredCredential as any);
    const update = jest.spyOn(YouTubeCredential, 'findOneAndUpdate').mockResolvedValue({ _id: 'credential-1' } as any);

    await expect(Promise.all([
      service.getAccessToken('owner-concurrent'), service.getAccessToken('owner-concurrent'), service.getAccessToken('owner-concurrent'),
    ])).resolves.toEqual(['refreshed-access', 'refreshed-access', 'refreshed-access']);

    expect(http.post).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect((update.mock.calls[0][1] as any).$set).toMatchObject({ tokenRefreshAttempts: 1 });
    find.mockRestore();
    update.mockRestore();
  });

  test('retries transient Google failures but does not retry or expose a revoked refresh token', async () => {
    process.env.YOUTUBE_TOKEN_REFRESH_RETRY_MS = '0';
    const service = new YouTubeTokenService({ post: jest.fn()
      .mockRejectedValueOnce({ response: { status: 503, data: { error: 'temporarily_unavailable' } } })
      .mockResolvedValueOnce({ data: { access_token: 'after-retry', expires_in: 3600 } }) } as any);
    const refreshToken = service.encrypt('secret-refresh-token');
    const credential = {
      _id: 'credential-transient', accessTokenExpiresAt: new Date(0),
      accessToken: { toObject: () => service.encrypt('expired-access') }, refreshToken: { toObject: () => refreshToken },
    };
    const find = jest.spyOn(YouTubeCredential, 'findOne').mockResolvedValue(credential as any);
    const update = jest.spyOn(YouTubeCredential, 'findOneAndUpdate').mockResolvedValue({ _id: credential._id } as any);

    await expect(service.getAccessToken('owner-transient')).resolves.toBe('after-retry');
    expect((service as any).http.post).toHaveBeenCalledTimes(2);
    expect((update.mock.calls[0][1] as any).$set.tokenRefreshAttempts).toBe(2);
    find.mockRestore();
    update.mockRestore();

    const revokedHttp = { post: jest.fn().mockRejectedValue({ response: { status: 400, data: { error: 'invalid_grant', error_description: 'sensitive' } } }) } as any;
    const revokedService = new YouTubeTokenService(revokedHttp);
    const revokedToken = revokedService.encrypt('revoked-secret-token');
    const revokedFind = jest.spyOn(YouTubeCredential, 'findOne').mockResolvedValue({
      _id: 'credential-revoked', accessTokenExpiresAt: new Date(0),
      accessToken: { toObject: () => revokedService.encrypt('expired-access') }, refreshToken: { toObject: () => revokedToken },
    } as any);
    const record = jest.spyOn(YouTubeCredential, 'updateOne').mockResolvedValue({ acknowledged: true } as any);

    await expect(revokedService.getAccessToken('owner-revoked')).rejects.toMatchObject({ response: { data: { error: 'invalid_grant' } } });
    expect(revokedHttp.post).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(record.mock.calls[0])).not.toContain('revoked-secret-token');
    expect(record.mock.calls[0][1]).toEqual(expect.objectContaining({ $set: expect.objectContaining({
      tokenRefreshAttempts: 1,
      lastTokenRefreshFailure: expect.objectContaining({ reason: 'invalid_grant', transient: false }),
      lastPollingFailure: expect.objectContaining({ operation: 'oauth_refresh', reason: 'invalid_grant' }),
    }) }));
    revokedFind.mockRestore();
    record.mockRestore();
    delete process.env.YOUTUBE_TOKEN_REFRESH_RETRY_MS;
  });
});
