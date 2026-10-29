import crypto from 'crypto';

export class TikTokOAuthService {
  private static stateSecret(): string {
    const secret = process.env.TIKTOK_OAUTH_STATE_SECRET?.trim();
    if (!secret || secret.length < 32)
      throw new Error('TIKTOK_OAUTH_STATE_SECRET debe tener al menos 32 caracteres');
    return secret;
  }

  static createState(userId: string): string {
    const payload = Buffer.from(
      JSON.stringify({ userId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomBytes(16).toString('hex') })
    ).toString('base64url');
    const signature = crypto.createHmac('sha256', this.stateSecret()).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  static verifyState(state: string): string {
    const [payload, signature] = state.split('.');
    if (!payload || !signature) throw new Error('Estado OAuth TikTok inválido');
    const expected = crypto.createHmac('sha256', this.stateSecret()).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received))
      throw new Error('Firma OAuth TikTok inválida');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId?: string;
      exp?: number;
    };
    if (!decoded.userId || !decoded.exp || decoded.exp < Date.now())
      throw new Error('Estado OAuth TikTok expirado');
    return decoded.userId;
  }

  static authorizationUrl(userId: string): string {
    const clientKey = process.env.TIKTOK_CLIENT_KEY?.trim();
    const redirectUri = process.env.TIKTOK_OAUTH_REDIRECT_URI?.trim();
    if (!clientKey || !redirectUri) throw new Error('OAuth TikTok no configurado');
    const params = new URLSearchParams({
      client_key: clientKey,
      response_type: 'code',
      scope: process.env.TIKTOK_OAUTH_SCOPES?.trim() || 'user.info.basic',
      redirect_uri: redirectUri,
      state: this.createState(userId),
    });
    return `https://www.tiktok.com/v2/auth/authorize/?${params}`;
  }
}
