import crypto from 'crypto';
import axios, { type AxiosInstance } from 'axios';
import TikTokCredential from '../../models/TikTokCredential';

type Encrypted = { ciphertext: string; iv: string; authTag: string };
type TokenPayload = {
  access_token: string;
  expires_in: number;
  open_id: string;
  refresh_expires_in: number;
  refresh_token: string;
  scope?: string;
  token_type?: string;
};

export class TikTokTokenService {
  constructor(private readonly http: AxiosInstance = axios) {}

  private key(): Buffer {
    const raw = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY?.trim();
    if (!raw) throw new Error('TIKTOK_TOKEN_ENCRYPTION_KEY no configurada');
    const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32)
      throw new Error('TIKTOK_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes');
    return key;
  }

  encrypt(value: string): Encrypted {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
    };
  }

  decrypt(value: Encrypted): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(value.ciphertext, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  async exchangeCode(code: string): Promise<TokenPayload> {
    const response = await this.http.post<TokenPayload>(
      'https://open.tiktokapis.com/v2/oauth/token/',
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.TIKTOK_OAUTH_REDIRECT_URI!,
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: Number(process.env.TIKTOK_TIMEOUT_MS || 10000),
      }
    );
    return response.data;
  }

  async saveAuthorization(userId: string, payload: TokenPayload): Promise<void> {
    if (
      !payload.access_token ||
      !payload.refresh_token ||
      !payload.open_id ||
      !Number.isFinite(payload.expires_in) ||
      !Number.isFinite(payload.refresh_expires_in)
    )
      throw new Error('TikTok devolvió una autorización incompleta');
    const now = Date.now();
    const existing: any = await TikTokCredential.findOne({ userId }).select('connectedAt').lean();
    await TikTokCredential.findOneAndUpdate(
      { userId },
      {
        $set: {
          userId,
          openId: payload.open_id,
          accessToken: this.encrypt(payload.access_token),
          refreshToken: this.encrypt(payload.refresh_token),
          accessTokenExpiresAt: new Date(now + payload.expires_in * 1000),
          refreshTokenExpiresAt: new Date(now + payload.refresh_expires_in * 1000),
          scope: payload.scope?.split(',').map(scope => scope.trim()).filter(Boolean) ?? [],
          connectedAt: existing?.connectedAt || new Date(now),
        },
        $unset: { lastAuthFailure: 1 },
      },
      { upsert: true }
    );
  }

  async getAccessToken(userId: string): Promise<string> {
    const credential: any = await TikTokCredential.findOne({ userId });
    if (!credential) throw new Error('Cuenta TikTok no conectada');
    if (credential.accessTokenExpiresAt.getTime() > Date.now() + 60_000)
      return this.decrypt(credential.accessToken.toObject());
    try {
      const response = await this.http.post<TokenPayload>(
        'https://open.tiktokapis.com/v2/oauth/token/',
        new URLSearchParams({
          client_key: process.env.TIKTOK_CLIENT_KEY!,
          client_secret: process.env.TIKTOK_CLIENT_SECRET!,
          grant_type: 'refresh_token',
          refresh_token: this.decrypt(credential.refreshToken.toObject()),
        }),
        {
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          timeout: Number(process.env.TIKTOK_TIMEOUT_MS || 10000),
        }
      );
      const payload = response.data;
      if (!payload.access_token || !payload.refresh_token)
        throw new Error('TikTok devolvió una renovación incompleta');
      credential.accessToken = this.encrypt(payload.access_token);
      credential.refreshToken = this.encrypt(payload.refresh_token);
      credential.accessTokenExpiresAt = new Date(Date.now() + payload.expires_in * 1000);
      credential.refreshTokenExpiresAt = new Date(Date.now() + payload.refresh_expires_in * 1000);
      credential.scope = payload.scope?.split(',').map(scope => scope.trim()).filter(Boolean) ?? credential.scope;
      credential.lastAuthFailure = undefined;
      await credential.save();
      return payload.access_token;
    } catch (error) {
      credential.lastAuthFailure = { operation: 'oauth_refresh', recordedAt: new Date() };
      await credential.save().catch(() => undefined);
      throw error;
    }
  }

  async revoke(userId: string): Promise<void> {
    const credential: any = await TikTokCredential.findOne({ userId });
    if (!credential) return;
    await this.http.post(
      'https://open.tiktokapis.com/v2/oauth/revoke/',
      new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY!,
        client_secret: process.env.TIKTOK_CLIENT_SECRET!,
        token: this.decrypt(credential.accessToken.toObject()),
      }),
      {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: Number(process.env.TIKTOK_TIMEOUT_MS || 10000),
      }
    );
    await TikTokCredential.deleteOne({ _id: credential._id, userId });
  }
}
