import crypto from 'crypto';

export class YouTubeOAuthService {
  static createState(userId: string): string {
    const payload = Buffer.from(JSON.stringify({ userId, exp: Date.now() + 10 * 60_000, nonce: crypto.randomBytes(16).toString('hex') })).toString('base64url');
    const signature = crypto.createHmac('sha256', process.env.YOUTUBE_OAUTH_STATE_SECRET!).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  static verifyState(state: string): string {
    const [payload, signature] = state.split('.');
    if (!payload || !signature) throw new Error('Estado OAuth inválido');
    const expected = crypto.createHmac('sha256', process.env.YOUTUBE_OAUTH_STATE_SECRET!).update(payload).digest();
    const received = Buffer.from(signature, 'base64url');
    if (expected.length !== received.length || !crypto.timingSafeEqual(expected, received)) throw new Error('Firma OAuth inválida');
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString()) as { userId: string; exp: number };
    if (!decoded.userId || decoded.exp < Date.now()) throw new Error('Estado OAuth expirado');
    return decoded.userId;
  }

  static authorizationUrl(userId: string): string {
    const params = new URLSearchParams({ client_id: process.env.YOUTUBE_CLIENT_ID!, redirect_uri: process.env.YOUTUBE_OAUTH_REDIRECT_URI!,
      response_type: 'code', access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      scope: 'https://www.googleapis.com/auth/youtube.force-ssl', state: this.createState(userId) });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
}
