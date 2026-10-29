import { TikTokOAuthService } from '../src/integrations/tiktok/TikTokOAuthService';
import { TikTokTokenService } from '../src/integrations/tiktok/TikTokTokenService';
import TikTokCredential from '../src/models/TikTokCredential';

describe('TikTok Login Kit OAuth security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      TIKTOK_CLIENT_KEY: 'client-key',
      TIKTOK_CLIENT_SECRET: 'client-secret',
      TIKTOK_OAUTH_REDIRECT_URI: 'https://api.example.com/api/v1/tiktok/oauth/callback',
      TIKTOK_OAUTH_STATE_SECRET: 'state-secret-with-at-least-32-characters',
      TIKTOK_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString('base64'),
      TIKTOK_OAUTH_SCOPES: 'user.info.basic',
    };
  });

  afterEach(() => jest.restoreAllMocks());
  afterAll(() => { process.env = originalEnv; });

  test('builds the v2 web authorization URL with minimum scope and signed state', () => {
    const url = new URL(TikTokOAuthService.authorizationUrl('507f1f77bcf86cd799439011'));
    expect(url.origin + url.pathname).toBe('https://www.tiktok.com/v2/auth/authorize/');
    expect(url.searchParams.get('client_key')).toBe('client-key');
    expect(url.searchParams.get('scope')).toBe('user.info.basic');
    expect(url.searchParams.get('redirect_uri')).toBe(process.env.TIKTOK_OAUTH_REDIRECT_URI);
    expect(TikTokOAuthService.verifyState(url.searchParams.get('state')!)).toBe('507f1f77bcf86cd799439011');
  });

  test('rejects tampered state', () => {
    const state = TikTokOAuthService.createState('507f1f77bcf86cd799439011');
    expect(() => TikTokOAuthService.verifyState(`${state}x`)).toThrow('Firma OAuth TikTok inválida');
  });

  test('encrypts tokens using authenticated encryption', () => {
    const service = new TikTokTokenService();
    const encrypted = service.encrypt('refresh-token-secret');
    expect(encrypted.ciphertext).not.toContain('refresh-token-secret');
    expect(service.decrypt(encrypted)).toBe('refresh-token-secret');
    expect(() => service.decrypt({ ...encrypted, authTag: Buffer.alloc(16).toString('base64') })).toThrow();
  });

  test('exchanges the code only on the server with the registered redirect URI', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: { access_token: 'access', refresh_token: 'refresh' } }) } as any;
    await new TikTokTokenService(http).exchangeCode('authorization-code');
    expect(http.post).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/oauth/token/',
      expect.any(URLSearchParams),
      expect.objectContaining({ headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
    );
    const body = http.post.mock.calls[0][1] as URLSearchParams;
    expect(body.get('client_secret')).toBe('client-secret');
    expect(body.get('redirect_uri')).toBe(process.env.TIKTOK_OAUTH_REDIRECT_URI);
  });

  test('stores access and refresh tokens encrypted without enabling transport capabilities', async () => {
    jest.spyOn(TikTokCredential, 'findOne').mockReturnValue({
      select: () => ({ lean: async () => null }),
    } as any);
    const update = jest.spyOn(TikTokCredential, 'findOneAndUpdate').mockResolvedValue({} as any);
    await new TikTokTokenService().saveAuthorization('507f1f77bcf86cd799439011', {
      access_token: 'access-secret',
      refresh_token: 'refresh-secret',
      open_id: 'open-id',
      expires_in: 86400,
      refresh_expires_in: 31536000,
      scope: 'user.info.basic',
    });
    const stored = update.mock.calls[0][1] as any;
    expect(stored.$set.accessToken.ciphertext).not.toContain('access-secret');
    expect(stored.$set.refreshToken.ciphertext).not.toContain('refresh-secret');
    expect(stored.$set.scope).toEqual(['user.info.basic']);
    expect(stored.$unset).toEqual({ lastAuthFailure: 1 });
  });

  test('refreshes expired access tokens and rotates the refresh token', async () => {
    const service = new TikTokTokenService({
      post: jest.fn().mockResolvedValue({ data: {
        access_token: 'new-access', refresh_token: 'new-refresh', open_id: 'open-id',
        expires_in: 86400, refresh_expires_in: 31536000, scope: 'user.info.basic',
      } }),
    } as any);
    const credential = {
      accessToken: { toObject: () => service.encrypt('old-access') },
      refreshToken: { toObject: () => service.encrypt('old-refresh') },
      accessTokenExpiresAt: new Date(0),
      save: jest.fn(),
    };
    jest.spyOn(TikTokCredential, 'findOne').mockResolvedValue(credential as any);
    await expect(service.getAccessToken('507f1f77bcf86cd799439011')).resolves.toBe('new-access');
    expect(credential.save).toHaveBeenCalled();
    expect(service.decrypt(credential.refreshToken as any)).toBe('new-refresh');
  });

  test('revokes remotely before deleting the local credential', async () => {
    const http = { post: jest.fn().mockResolvedValue({ data: {} }) } as any;
    const service = new TikTokTokenService(http);
    jest.spyOn(TikTokCredential, 'findOne').mockResolvedValue({
      _id: 'credential-1',
      accessToken: { toObject: () => service.encrypt('access-token') },
    } as any);
    const remove = jest.spyOn(TikTokCredential, 'deleteOne').mockResolvedValue({ acknowledged: true } as any);
    await service.revoke('507f1f77bcf86cd799439011');
    expect(http.post).toHaveBeenCalledWith(
      'https://open.tiktokapis.com/v2/oauth/revoke/',
      expect.any(URLSearchParams),
      expect.any(Object)
    );
    expect(remove).toHaveBeenCalledWith({ _id: 'credential-1', userId: '507f1f77bcf86cd799439011' });
  });
});
