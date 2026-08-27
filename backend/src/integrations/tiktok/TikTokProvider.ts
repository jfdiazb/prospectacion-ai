export type TikTokEventKind = 'comment' | 'direct_message';

export interface TikTokOfficialEvent {
  eventId: string;
  eventType: TikTokEventKind;
  senderId: string;
  text: string;
  occurredAt: string;
  videoId?: string;
  commentId?: string;
  accountId?: string;
  conversationId?: string;
  publicUrl?: string;
  senderDisplayName?: string;
}

export interface NormalizedTikTokEvent {
  externalEventId: string;
  eventType: TikTokEventKind;
  senderId: string;
  text: string;
  occurredAt: Date;
  source: 'tiktok_owned_video_comment' | 'tiktok_business_message';
  mediaId?: string;
  commentId?: string;
  accountId?: string;
  externalConversationId?: string;
  publicUrl?: string;
  senderDisplayName?: string;
}

export class TikTokProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'FEATURE_DISABLED'
      | 'API_UNAVAILABLE'
      | 'INVALID_EVENT'
      | 'EXTERNAL_ERROR'
  ) {
    super(message);
    this.name = 'TikTokProviderError';
  }
}

/**
 * Boundary for events delivered by approved TikTok API for Business products.
 * It deliberately contains no guessed transport endpoint or credentials.
 */
export class TikTokProvider {
  normalizeEvent(event: TikTokOfficialEvent): NormalizedTikTokEvent {
    if (!event || !['comment', 'direct_message'].includes(event.eventType)) {
      throw new TikTokProviderError(
        'Tipo de evento oficial TikTok no compatible',
        'API_UNAVAILABLE'
      );
    }
    const eventId = event.eventId?.trim();
    const senderId = event.senderId?.trim();
    const text = event.text?.trim();
    const occurredAt = new Date(event.occurredAt);
    if (!eventId || !senderId || !text || Number.isNaN(occurredAt.getTime())) {
      throw new TikTokProviderError('Evento TikTok incompleto o inválido', 'INVALID_EVENT');
    }
    if (event.eventType === 'comment' && !event.commentId) {
      throw new TikTokProviderError('El comentario TikTok no incluye commentId', 'INVALID_EVENT');
    }
    if (event.eventType === 'direct_message' && !event.conversationId) {
      throw new TikTokProviderError('El mensaje TikTok no incluye conversationId', 'INVALID_EVENT');
    }
    return {
      externalEventId: eventId,
      eventType: event.eventType,
      senderId,
      text,
      occurredAt,
      source:
        event.eventType === 'comment' ? 'tiktok_owned_video_comment' : 'tiktok_business_message',
      mediaId: event.videoId,
      commentId: event.commentId?.trim() || undefined,
      accountId: event.accountId?.trim() || undefined,
      externalConversationId: event.conversationId,
      publicUrl: event.publicUrl,
      senderDisplayName: event.senderDisplayName?.trim() || undefined,
    };
  }
}
