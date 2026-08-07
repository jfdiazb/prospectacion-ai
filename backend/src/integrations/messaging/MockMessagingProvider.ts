import type { MessagingProvider, MessagingRequest, MessagingResult } from './MessagingProvider';

export class MockMessagingProvider implements MessagingProvider {
  readonly name = 'mock' as const;
  async sendMessage(request: MessagingRequest): Promise<MessagingResult> {
    const recipient = request.recipient.type === 'comment' ? request.recipient.commentId
      : request.recipient.type === 'instagram_user' ? request.recipient.instagramScopedId
        : request.recipient.type === 'whatsapp_user' ? request.recipient.phoneNumber : request.recipient.parentCommentId;
    return { externalMessageId: `mock-${recipient}`, simulated: true };
  }
}
