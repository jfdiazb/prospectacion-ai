import axios, { type AxiosInstance } from 'axios';
import { MessagingProviderError, type MessagingProvider, type MessagingRequest, type MessagingResult } from './MessagingProvider';

type MetaResponse = { message_id?: string; id?: string };

export class MetaMessagingProvider implements MessagingProvider {
  readonly name = 'meta' as const;
  constructor(private readonly http: AxiosInstance = axios.create()) {}

  async sendMessage(request: MessagingRequest): Promise<MessagingResult> {
    if (request.recipient.type === 'whatsapp_user') return this.sendWhatsAppMessage(request);
    if (request.recipient.type === 'youtube_comment') throw new MessagingProviderError('YouTube requiere YouTubeMessagingProvider', 'META_INVALID_RECIPIENT');
    const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
    const isFacebook = request.recipient.type === 'facebook_user' || request.recipient.type === 'facebook_comment';
    const accessToken = isFacebook ? process.env.META_PAGE_ACCESS_TOKEN : process.env.META_ACCESS_TOKEN;
    const accountId = isFacebook ? process.env.META_PAGE_ID : process.env.META_IG_USER_ID;
    if (!accessToken || (!accountId && request.recipient.type !== 'facebook_comment')) throw new MessagingProviderError('Credenciales del canal Meta no configuradas', 'META_CONFIGURATION_ERROR');
    const metaRecipient = request.recipient;
    const endpoint = request.recipient.type === 'facebook_comment'
      ? `https://graph.facebook.com/${version}/${encodeURIComponent(request.recipient.commentId)}/private_replies`
      : `https://graph.facebook.com/${version}/${encodeURIComponent(accountId!)}/messages`;
    let destination: { comment_id: string } | { id: string } | undefined;
    if (metaRecipient.type === 'comment' || metaRecipient.type === 'instagram_comment') destination = { comment_id: metaRecipient.commentId };
    else if (metaRecipient.type === 'facebook_user') destination = { id: metaRecipient.pageScopedId };
    else if (metaRecipient.type === 'instagram_user') destination = { id: metaRecipient.instagramScopedId };
    const body = metaRecipient.type === 'facebook_comment'
      ? { message: request.text }
      : { recipient: destination, message: { text: request.text } };
    try {
      const response = await this.http.post<MetaResponse>(
        endpoint, body,
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: Number(process.env.META_MESSAGING_TIMEOUT_MS || 10000) },
      );
      const externalMessageId = response.data?.message_id ?? response.data?.id;
      if (!externalMessageId || typeof externalMessageId !== 'string') throw new MessagingProviderError('Respuesta inválida de Meta: falta message_id', 'META_INVALID_RESPONSE');
      return { externalMessageId, simulated: false };
    } catch (error) {
      if (error instanceof MessagingProviderError) throw error;
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') throw new MessagingProviderError('Tiempo de espera agotado al contactar Meta', 'META_TIMEOUT');
        const metaError = error.response?.data as { error?: { code?: number; message?: string } } | undefined;
        const status = error.response?.status;
        const code = metaError?.error?.code != null ? String(metaError.error.code) : status ? `HTTP_${status}` : 'META_REQUEST_ERROR';
        const message = metaError?.error?.message || (status ? `Meta respondió con HTTP ${status}` : 'No fue posible contactar Meta');
        throw new MessagingProviderError(message, code, status);
      }
      throw new MessagingProviderError('Error inesperado al contactar Meta', 'META_UNKNOWN_ERROR');
    }
  }

  private async sendWhatsAppMessage(request: MessagingRequest): Promise<MessagingResult> {
    if (request.recipient.type !== 'whatsapp_user') throw new MessagingProviderError('Destinatario de WhatsApp inválido', 'META_INVALID_RECIPIENT');
    const accessToken = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
    const version = process.env.META_GRAPH_API_VERSION || 'v23.0';
    if (!accessToken || !phoneNumberId) throw new MessagingProviderError('Credenciales de WhatsApp no configuradas', 'WHATSAPP_CONFIGURATION_ERROR');
    try {
      const response = await this.http.post<MetaResponse>(`https://graph.facebook.com/${version}/${encodeURIComponent(phoneNumberId)}/messages`,
        { messaging_product: 'whatsapp', to: request.recipient.phoneNumber, type: 'text', text: { body: request.text } },
        { headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }, timeout: Number(process.env.META_MESSAGING_TIMEOUT_MS || 10000) });
      const data = response.data as MetaResponse & { messages?: Array<{ id?: string }> };
      const externalMessageId = data.messages?.[0]?.id ?? data.message_id ?? data.id;
      if (!externalMessageId || typeof externalMessageId !== 'string') throw new MessagingProviderError('Respuesta inválida de WhatsApp: falta message id', 'WHATSAPP_INVALID_RESPONSE');
      return { externalMessageId, simulated: false };
    } catch (error) { throw this.normalizeError(error); }
  }

  private normalizeError(error: unknown): MessagingProviderError {
    if (error instanceof MessagingProviderError) return error;
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return new MessagingProviderError('Tiempo de espera agotado al contactar Meta', 'META_TIMEOUT');
      const metaError = error.response?.data as { error?: { code?: number; message?: string } } | undefined;
      const status = error.response?.status;
      return new MessagingProviderError(metaError?.error?.message || (status ? `Meta respondió con HTTP ${status}` : 'No fue posible contactar Meta'), metaError?.error?.code != null ? String(metaError.error.code) : status ? `HTTP_${status}` : 'META_REQUEST_ERROR', status);
    }
    return new MessagingProviderError('Error inesperado al contactar Meta', 'META_UNKNOWN_ERROR');
  }
}
