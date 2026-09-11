import crypto from 'crypto';
import axios, { type AxiosInstance } from 'axios';
import YouTubeCredential from '../../models/YouTubeCredential';

type Encrypted = { ciphertext: string; iv: string; authTag: string };
type TokenPayload = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };
type ChannelItem = { id: string; snippet?: { title?: string; customUrl?: string } };

export class YouTubeTokenService {
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
    if (!payload.access_token || !payload.refresh_token) throw new Error('Google no devolvió access token y refresh token; revoca el consentimiento y vuelve a conectar');
    const channel = await this.http.get<{ items?: ChannelItem[] }>('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: { Authorization: `Bearer ${payload.access_token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
    });
    const item = channel.data.items?.[0];
    if (!item?.id) throw new Error('No se encontró un canal de YouTube asociado');
    const existing: any = await YouTubeCredential.findOne({ userId })
      .select('connectedAt lastPolledAt channelId channelTitle channelHandle authorizedChannelId')
      .lean();
    const now = new Date();
    const preserveExplicitSelection = Boolean(
      existing?.authorizedChannelId && existing.channelId !== existing.authorizedChannelId
    );
    await YouTubeCredential.findOneAndUpdate({ userId }, {
      $set: { userId,
        channelId: preserveExplicitSelection ? existing.channelId : item.id,
        channelTitle: preserveExplicitSelection ? existing.channelTitle : item.snippet?.title,
        channelHandle: preserveExplicitSelection ? existing.channelHandle : item.snippet?.customUrl,
        authorizedChannelId: item.id, authorizedChannelTitle: item.snippet?.title, authorizedChannelHandle: item.snippet?.customUrl,
        refreshToken: this.encrypt(payload.refresh_token), accessToken: this.encrypt(payload.access_token),
        accessTokenExpiresAt: new Date(Date.now() + payload.expires_in * 1000), scope: payload.scope?.split(' ') ?? [],
        connectedAt: existing?.connectedAt || now, lastPolledAt: existing?.lastPolledAt || now,
      },
      $unset: { lastPollingFailure: 1 },
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
    const response = await this.http.post<TokenPayload>('https://oauth2.googleapis.com/token', new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID!, client_secret: process.env.YOUTUBE_CLIENT_SECRET!,
      refresh_token: this.decrypt(credential.refreshToken.toObject()), grant_type: 'refresh_token',
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
    credential.accessToken = this.encrypt(response.data.access_token);
    credential.accessTokenExpiresAt = new Date(Date.now() + response.data.expires_in * 1000);
    await credential.save();
    return response.data.access_token;
  }
}
