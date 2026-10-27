import crypto from 'crypto';
import axios, { type AxiosInstance } from 'axios';
import YouTubeCredential from '../../models/YouTubeCredential';

type Encrypted = { ciphertext: string; iv: string; authTag: string };
type TokenPayload = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
type ChannelItem = { id: string; snippet?: { title?: string; customUrl?: string } };
type SafeRefreshFailure = { reason: string; transient: boolean; failedAt: Date; attempts: number };

export class YouTubeTokenService {
  private static readonly refreshes = new Map<string, Promise<string>>();

  constructor(private readonly http: AxiosInstance = axios) {}

  private key(): Buffer {
    const raw = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim();
    if (!raw) throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY no configurada');
    const key = /^[a-f\d]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (key.length !== 32) throw new Error('YOUTUBE_TOKEN_ENCRYPTION_KEY debe representar exactamente 32 bytes');
    return key;
  }

  encrypt(value: string): Encrypted {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.key(), iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { ciphertext: ciphertext.toString('base64'), iv: iv.toString('base64'), authTag: cipher.getAuthTag().toString('base64') };
  }

  decrypt(value: Encrypted): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.key(), Buffer.from(value.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(value.authTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(value.ciphertext, 'base64')), decipher.final()]).toString('utf8');
  }

  async exchangeCode(code: string): Promise<TokenPayload> {
    const response = await this.http.post<TokenPayload>('https://oauth2.googleapis.com/token', new URLSearchParams({
      code,
      client_id: process.env.YOUTUBE_CLIENT_ID!,
      client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      redirect_uri: process.env.YOUTUBE_OAUTH_REDIRECT_URI!,
      grant_type: 'authorization_code',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
    return response.data;
  }

  async saveAuthorization(userId: string, payload: TokenPayload): Promise<void> {
    if (!payload.access_token) throw new Error('Google no devolvió un access token');
    const channel = await this.http.get<{ items?: ChannelItem[] }>('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: { Authorization: `Bearer ${payload.access_token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
    });
    const item = channel.data.items?.[0];
    if (!item?.id) throw new Error('No se encontró un canal de YouTube asociado');
    const existing: any = await YouTubeCredential.findOne({ userId })
      .select('connectedAt lastPolledAt channelId channelTitle channelHandle authorizedChannelId refreshToken')
      .lean();
    if (!payload.refresh_token && !existing?.refreshToken) {
      throw new Error('Google no devolvió un refresh token; vuelve a autorizar el acceso offline');
    }
    const now = new Date();
    const preserveExplicitSelection = Boolean(
      existing?.authorizedChannelId && existing.channelId !== existing.authorizedChannelId
    );
    const authorization: Record<string, unknown> = { userId,
        channelId: preserveExplicitSelection ? existing.channelId : item.id,
        channelTitle: preserveExplicitSelection ? existing.channelTitle : item.snippet?.title,
        channelHandle: preserveExplicitSelection ? existing.channelHandle : item.snippet?.customUrl,
        authorizedChannelId: item.id, authorizedChannelTitle: item.snippet?.title, authorizedChannelHandle: item.snippet?.customUrl,
        accessToken: this.encrypt(payload.access_token),
        accessTokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000), scope: payload.scope?.split(' ') ?? [],
        connectedAt: existing?.connectedAt || now, lastAuthorizedAt: now, lastPolledAt: existing?.lastPolledAt || now,
        lastTokenRefreshSuccessAt: now, tokenRefreshAttempts: 0,
      };
    if (payload.refresh_token) authorization.refreshToken = this.encrypt(payload.refresh_token);
    await YouTubeCredential.findOneAndUpdate({ userId }, {
      $set: authorization,
      $unset: { lastPollingFailure: 1, lastTokenRefreshFailure: 1 },
    }, { upsert: true });
  }

  async selectMonitoredChannel(userId: string, handle: string): Promise<ChannelItem> {
    const normalized = handle.trim().replace(/^https?:\/\/(?:www\.)?youtube\.com\//i, '').replace(/^@?/, '@');
    if (!/^@[A-Za-z0-9._-]{3,30}$/.test(normalized)) throw new Error('Handle de YouTube inválido');
    const token = await this.getAccessToken(userId);
    const params = new URLSearchParams({ part: 'id,snippet', forHandle: normalized });
    const response = await this.http.get<{ items?: ChannelItem[] }>(`https://www.googleapis.com/youtube/v3/channels?${params}`, {
      headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
    });
    const item = response.data.items?.[0];
    if (!item?.id) throw new Error('No se encontró el canal solicitado');
    await YouTubeCredential.updateOne({ userId }, {
      $set: { channelId: item.id, channelTitle: item.snippet?.title, channelHandle: item.snippet?.customUrl || normalized },
      $unset: { lastPollingFailure: 1, lastPollingSummary: 1 },
    });
    return item;
  }

  async getAccessToken(userId: string): Promise<string> {
    const credential: any = await YouTubeCredential.findOne({ userId });
    if (!credential) throw new Error('Canal de YouTube no conectado');
    if (credential.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return this.decrypt(credential.accessToken.toObject());
    const key = String(userId);
    const active = YouTubeTokenService.refreshes.get(key);
    if (active) return active;
    const refresh = this.refreshAccessToken(userId).finally(() => {
      if (YouTubeTokenService.refreshes.get(key) === refresh) YouTubeTokenService.refreshes.delete(key);
    });
    YouTubeTokenService.refreshes.set(key, refresh);
    return refresh;
  }

  private async refreshAccessToken(userId: string): Promise<string> {
    const credential: any = await YouTubeCredential.findOne({ userId });
    if (!credential) throw new Error('Canal de YouTube no conectado');
    if (credential.accessTokenExpiresAt.getTime() > Date.now() + 60_000) return this.decrypt(credential.accessToken.toObject());
    const refreshToken = credential.refreshToken.toObject();
    const startedAt = new Date();
    const maxAttempts = Math.max(1, Math.min(3, Number(process.env.YOUTUBE_TOKEN_REFRESH_MAX_ATTEMPTS || 3)));
    let attempts = 0;
    try {
      let response: { data: TokenPayload } | undefined;
      while (!response && attempts < maxAttempts) {
        attempts += 1;
        try {
          response = await this.http.post<TokenPayload>('https://oauth2.googleapis.com/token', new URLSearchParams({
            client_id: process.env.YOUTUBE_CLIENT_ID!, client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
            refresh_token: this.decrypt(refreshToken), grant_type: 'refresh_token',
          }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
        } catch (error) {
          if (!this.isTransientRefreshFailure(error) || attempts >= maxAttempts) throw error;
          await new Promise(resolve => setTimeout(resolve, Number(process.env.YOUTUBE_TOKEN_REFRESH_RETRY_MS || 250) * attempts));
        }
      }
      if (!response?.data.access_token || !response.data.expires_in) throw new Error('Respuesta OAuth de renovación incompleta');
      const successAt = new Date();
      const updated: any = await YouTubeCredential.findOneAndUpdate(
        { _id: credential._id, 'refreshToken.ciphertext': refreshToken.ciphertext },
        {
          $set: {
            accessToken: this.encrypt(response.data.access_token),
            accessTokenExpiresAt: new Date(Date.now() + response.data.expires_in * 1000),
            lastTokenRefreshAt: startedAt, lastTokenRefreshSuccessAt: successAt, tokenRefreshAttempts: attempts,
          },
          $unset: { lastTokenRefreshFailure: 1, lastPollingFailure: 1 },
        },
        { new: true },
      );
      if (updated) {
        console.info('YouTube OAuth token refresh completed', { attempts });
        return response.data.access_token;
      }
      const current: any = await YouTubeCredential.findOne({ userId });
      if (current?.accessTokenExpiresAt?.getTime() > Date.now() + 60_000) {
        console.info('YouTube OAuth token refresh superseded by newer authorization');
        return this.decrypt(current.accessToken.toObject());
      }
      throw new Error('La autorización de YouTube cambió durante la renovación');
    } catch (error) {
      const failure = this.safeRefreshFailure(error, attempts);
      await YouTubeCredential.updateOne(
        { _id: credential._id, 'refreshToken.ciphertext': refreshToken.ciphertext },
        { $set: {
          lastTokenRefreshAt: startedAt, lastTokenRefreshFailure: failure, tokenRefreshAttempts: attempts,
          ...(failure.reason === 'invalid_grant'
            ? { lastPollingFailure: { operation: 'oauth_refresh', reason: failure.reason, failedAt: failure.failedAt } }
            : {}),
        } },
      );
      console.warn('YouTube OAuth token refresh failed', { reason: failure.reason, transient: failure.transient, attempts });
      throw error;
    }
  }

  private isTransientRefreshFailure(error: unknown): boolean {
    const candidate = error as { response?: { status?: number; data?: { error?: string } }; code?: string };
    const status = Number(candidate?.response?.status || 0);
    const reason = candidate?.response?.data?.error;
    if (['invalid_grant', 'invalid_client', 'unauthorized_client'].includes(reason || '')) return false;
    return status === 429 || status >= 500 || !candidate?.response
      || ['ECONNRESET', 'ETIMEDOUT', 'ECONNABORTED'].includes(candidate?.code || '');
  }

  private safeRefreshFailure(error: unknown, attempts: number): SafeRefreshFailure {
    const candidate = error as { response?: { status?: number; data?: { error?: string } }; code?: string };
    const status = Number(candidate?.response?.status || 0);
    const reason = candidate?.response?.data?.error
      || (status === 429 ? 'rate_limited' : undefined)
      || (status >= 500 ? 'google_unavailable' : undefined)
      || (candidate?.code ? 'network_error' : 'oauth_refresh_failed');
    return { reason, transient: this.isTransientRefreshFailure(error), failedAt: new Date(), attempts };
  }
}
