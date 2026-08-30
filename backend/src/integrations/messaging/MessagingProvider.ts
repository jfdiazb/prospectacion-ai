export type MessagingRecipient =
  | { type: 'comment'; commentId: string }
  | { type: 'instagram_user'; instagramScopedId: string }
  | { type: 'instagram_comment'; commentId: string }
  | { type: 'facebook_user'; pageScopedId: string }
  | { type: 'facebook_comment'; commentId: string }
  | { type: 'whatsapp_user'; phoneNumber: string }
  | { type: 'youtube_comment'; parentCommentId: string };

export interface MessagingRequest {
  userId?: string;
  text: string;
  recipient: MessagingRecipient;
  whatsappAuthorization?: {
    mode: 'static_allowlist' | 'inbound_conversation';
    recipientId: string;
    sourceEventId?: string;
  };
}
export interface MessagingResult { externalMessageId: string; simulated: boolean }

export interface MessagingProvider {
  readonly name: 'meta' | 'youtube' | 'mock';
  sendMessage(request: MessagingRequest): Promise<MessagingResult>;
}

export class MessagingProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'MessagingProviderError';
  }
}
