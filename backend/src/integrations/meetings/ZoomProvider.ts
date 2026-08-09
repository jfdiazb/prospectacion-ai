import axios, { type AxiosInstance } from 'axios';
import { MeetingProviderError, type MeetingProvider, type MeetingRequest, type MeetingResult } from './MeetingProvider';

type ZoomTokenResponse = { access_token?: string; expires_in?: number; api_url?: string };
type ZoomMeetingResponse = { id?: string | number; join_url?: string; start_time?: string };

export class ZoomProvider implements MeetingProvider {
  readonly name = 'zoom';
  private static cachedToken?: { value: string; expiresAt: number; apiUrl: string };
  constructor(private readonly http: AxiosInstance = axios.create()) {}

  static clearTokenCache(): void { ZoomProvider.cachedToken = undefined; }

  private async getAccessToken(): Promise<{ value: string; apiUrl: string }> {
    if (ZoomProvider.cachedToken && ZoomProvider.cachedToken.expiresAt > Date.now() + 60_000) return ZoomProvider.cachedToken;
    const clientId = process.env.ZOOM_CLIENT_ID;
    const clientSecret = process.env.ZOOM_CLIENT_SECRET;
    const accountId = process.env.ZOOM_ACCOUNT_ID;
    if (!clientId || !clientSecret || !accountId) throw new MeetingProviderError('Credenciales de Zoom no configuradas', 'ZOOM_CONFIGURATION_ERROR');
    try {
      const body = new URLSearchParams({ grant_type: 'account_credentials', account_id: accountId });
      const response = await this.http.post<ZoomTokenResponse>('https://zoom.us/oauth/token', body.toString(), {
        headers: { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: Number(process.env.ZOOM_TIMEOUT_MS || 10000),
      });
      const token = response.data?.access_token;
      const expiresIn = Number(response.data?.expires_in || 3600);
      if (!token || typeof token !== 'string') throw new MeetingProviderError('Respuesta OAuth inválida de Zoom', 'ZOOM_INVALID_TOKEN_RESPONSE');
      const apiUrl = this.validApiUrl(response.data?.api_url);
      ZoomProvider.cachedToken = { value: token, expiresAt: Date.now() + expiresIn * 1000, apiUrl };
      return ZoomProvider.cachedToken;
    } catch (error) { throw this.normalizeError(error, 'ZOOM_OAUTH_ERROR'); }
  }

  async createMeeting(request: MeetingRequest): Promise<MeetingResult> {
    const userId = process.env.ZOOM_USER_ID;
    if (!userId) throw new MeetingProviderError('ZOOM_USER_ID no configurado', 'ZOOM_CONFIGURATION_ERROR');
    const token = await this.getAccessToken();
    const payload: Record<string, unknown> = { topic: request.topic, type: 2, timezone: request.timezone,
      duration: request.durationMinutes ?? Number(process.env.ZOOM_MEETING_DURATION_MINUTES || 30), agenda: request.agenda,
      settings: { join_before_host: false, waiting_room: true } };
    if (request.scheduledFor) payload.start_time = this.formatLocalStartTime(request.scheduledFor, request.timezone);
    try {
      const response = await this.http.post<ZoomMeetingResponse>(`${token.apiUrl}/v2/users/${encodeURIComponent(userId)}/meetings`, payload,
        { headers: { Authorization: `Bearer ${token.value}`, 'Content-Type': 'application/json' }, timeout: Number(process.env.ZOOM_TIMEOUT_MS || 10000) });
      const externalId = response.data?.id;
      const joinUrl = response.data?.join_url;
      if ((typeof externalId !== 'string' && typeof externalId !== 'number') || !joinUrl || typeof joinUrl !== 'string') throw new MeetingProviderError('Respuesta inválida al crear la reunión en Zoom', 'ZOOM_INVALID_MEETING_RESPONSE');
      return { externalId: String(externalId), joinUrl, simulated: false, scheduledFor: request.scheduledFor };
    } catch (error) { throw this.normalizeError(error, 'ZOOM_CREATE_MEETING_ERROR'); }
  }

  private validApiUrl(value?: string): string {
    if (!value) return 'https://api.zoom.us';
    try { const url = new URL(value); return url.protocol === 'https:' && (url.hostname === 'api.zoom.us' || url.hostname.endsWith('.zoom.us')) ? url.origin : 'https://api.zoom.us'; }
    catch { return 'https://api.zoom.us'; }
  }

  private formatLocalStartTime(value: Date, timezone: string): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    const parts = Object.fromEntries(formatter.formatToParts(value).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }

  private normalizeError(error: unknown, fallbackCode: string): MeetingProviderError {
    if (error instanceof MeetingProviderError) return error;
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new MeetingProviderError('Tiempo de espera agotado al contactar Zoom', 'ZOOM_TIMEOUT');
      const data = error.response?.data as { code?: number | string; message?: string; reason?: string } | undefined;
      const status = error.response?.status;
      return new MeetingProviderError(data?.message || data?.reason || (status ? `Zoom respondió con HTTP ${status}` : 'No fue posible contactar Zoom'), data?.code != null ? String(data.code) : status ? `HTTP_${status}` : fallbackCode, status);
    }
    return new MeetingProviderError('Error inesperado al contactar Zoom', fallbackCode);
  }
}
