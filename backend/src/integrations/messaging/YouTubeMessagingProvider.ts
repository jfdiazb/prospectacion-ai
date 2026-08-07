import axios, { type AxiosInstance } from 'axios';
import { MessagingProviderError, type MessagingProvider, type MessagingRequest, type MessagingResult } from './MessagingProvider';
import { YouTubeTokenService } from '../youtube/YouTubeTokenService';

type YouTubeCommentResponse = { id?: string };

export class YouTubeMessagingProvider implements MessagingProvider {
  readonly name = 'youtube' as const;
  constructor(private readonly http: AxiosInstance = axios.create(), private readonly getToken?: (userId: string) => Promise<string>) {}

  async sendMessage(request: MessagingRequest): Promise<MessagingResult> {
    if (request.recipient.type !== 'youtube_comment') throw new MessagingProviderError('Destinatario de YouTube inválido', 'YOUTUBE_INVALID_RECIPIENT');
    const accessToken = process.env.YOUTUBE_ACCESS_TOKEN || (request.userId
      ? this.getToken ? await this.getToken(request.userId) : await new YouTubeTokenService(this.http).getAccessToken(request.userId)
      : undefined);
    if (!accessToken) throw new MessagingProviderError('Canal de YouTube no conectado', 'YOUTUBE_CONFIGURATION_ERROR');
    try {
      const response = await this.http.post<YouTubeCommentResponse>(
        'https://www.googleapis.com/youtube/v3/comments?part=snippet',
        { snippet: { parentId: request.recipient.parentCommentId, textOriginal: request.text } },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) },
      );
      if (!response.data?.id) throw new MessagingProviderError('Respuesta inválida de YouTube: falta comment id', 'YOUTUBE_INVALID_RESPONSE');
      return { externalMessageId: response.data.id, simulated: false };
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') throw new MessagingProviderError('Tiempo de espera agotado al contactar YouTube', 'YOUTUBE_TIMEOUT');
        const data = error.response?.data as { error?: { code?: number; message?: string; errors?: Array<{ reason?: string }> } } | undefined;
        const status = error.response?.status;
        throw new MessagingProviderError(data?.error?.message || (status ? `YouTube respondió con HTTP ${status}` : 'No fue posible contactar YouTube'), data?.error?.errors?.[0]?.reason || (data?.error?.code != null ? String(data.error.code) : status ? `HTTP_${status}` : 'YOUTUBE_REQUEST_ERROR'), status);
      }
      throw new MessagingProviderError('Error inesperado al contactar YouTube', 'YOUTUBE_UNKNOWN_ERROR');
    }
  }
}
