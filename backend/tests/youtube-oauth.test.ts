import { YouTubeOAuthService } from '../src/integrations/youtube/YouTubeOAuthService';
import { YouTubeTokenService } from '../src/integrations/youtube/YouTubeTokenService';

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
});
