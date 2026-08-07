import OutboundMessage from '../models/OutboundMessage';
import { getMessagingProvider, MessagingProviderError, type MessagingProvider, type MessagingRecipient } from '../integrations/messaging';

type SendContext = { userId: string; leadId: string; conversationId: string; sourceEventId: string; text: string; recipient: MessagingRecipient };

export class MessagingService {
  static async send(context: SendContext, provider?: MessagingProvider): Promise<void> {
    const channel = context.recipient.type === 'youtube_comment' ? 'youtube' : context.recipient.type === 'whatsapp_user' ? 'whatsapp' : 'instagram';
    const selectedProvider = provider ?? getMessagingProvider(channel);
    const recipientId = context.recipient.type === 'comment' ? context.recipient.commentId
      : context.recipient.type === 'instagram_user' ? context.recipient.instagramScopedId
        : context.recipient.type === 'whatsapp_user' ? context.recipient.phoneNumber : context.recipient.parentCommentId;
    let outbound;
    try {
      outbound = await OutboundMessage.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId,
        sourceEventId: context.sourceEventId, channel, messageType: context.recipient.type === 'comment' ? 'private_reply'
          : context.recipient.type === 'whatsapp_user' ? 'whatsapp_message' : context.recipient.type === 'youtube_comment' ? 'youtube_reply' : 'direct_message',
        text: context.text, deliveryStatus: 'pending', provider: selectedProvider.name, recipientId,
        commentId: context.recipient.type === 'comment' ? context.recipient.commentId : undefined });
    } catch (error: any) {
      if (error?.code === 11000) return;
      throw error;
    }
    try {
      const result = await selectedProvider.sendMessage({ userId: context.userId, text: context.text, recipient: context.recipient });
      await OutboundMessage.updateOne({ _id: outbound._id }, { deliveryStatus: result.simulated ? 'simulated' : 'sent', externalMessageId: result.externalMessageId, sentAt: new Date(), simulatedDelivery: result.simulated });
    } catch (error) {
      const providerError = error instanceof MessagingProviderError ? error : new MessagingProviderError('Error inesperado de mensajería', 'MESSAGING_UNKNOWN_ERROR');
      await OutboundMessage.updateOne({ _id: outbound._id }, { deliveryStatus: 'failed', failedAt: new Date(), errorCode: providerError.code, errorMessage: providerError.message, simulatedDelivery: false });
    }
  }
}
