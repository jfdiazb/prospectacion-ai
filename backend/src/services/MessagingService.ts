import OutboundMessage from '../models/OutboundMessage';
import { getMessagingProvider, MessagingProviderError, type MessagingProvider, type MessagingRecipient } from '../integrations/messaging';
import { WhatsAppOutboundAuthorizationService } from './WhatsAppOutboundAuthorizationService';

type SendContext = { userId: string; leadId: string; conversationId: string; sourceEventId: string; text: string; recipient: MessagingRecipient };

export class MessagingService {
  static async send(context: SendContext, provider?: MessagingProvider): Promise<'sent' | 'simulated' | 'failed' | 'duplicate'> {
    const channel = context.recipient.type === 'youtube_comment' ? 'youtube' : context.recipient.type === 'whatsapp_user' ? 'whatsapp'
      : context.recipient.type === 'facebook_user' || context.recipient.type === 'facebook_comment' ? 'facebook' : 'instagram';
    const selectedProvider = provider ?? getMessagingProvider(channel);
    const recipientId = context.recipient.type === 'comment' ? context.recipient.commentId
      : context.recipient.type === 'instagram_user' ? context.recipient.instagramScopedId
        : context.recipient.type === 'facebook_user' ? context.recipient.pageScopedId
          : context.recipient.type === 'instagram_comment' || context.recipient.type === 'facebook_comment' ? context.recipient.commentId
            : context.recipient.type === 'whatsapp_user' ? context.recipient.phoneNumber : context.recipient.parentCommentId;
    const authorization = context.recipient.type === 'whatsapp_user'
      ? await WhatsAppOutboundAuthorizationService.authorize({
          userId: context.userId,
          leadId: context.leadId,
          conversationId: context.conversationId,
          phoneNumber: context.recipient.phoneNumber,
        })
      : undefined;
    let outbound;
    try {
      outbound = await OutboundMessage.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId,
        sourceEventId: context.sourceEventId, channel, messageType: ['comment', 'instagram_comment', 'facebook_comment'].includes(context.recipient.type) ? 'private_reply'
          : context.recipient.type === 'whatsapp_user' ? 'whatsapp_message' : context.recipient.type === 'youtube_comment' ? 'youtube_reply' : 'direct_message',
        text: context.text, deliveryStatus: 'pending', provider: selectedProvider.name, recipientId,
        commentId: context.recipient.type === 'comment' || context.recipient.type === 'instagram_comment' || context.recipient.type === 'facebook_comment' ? context.recipient.commentId : undefined,
        authorization: authorization || undefined });
    } catch (error: any) {
      if (error?.code === 11000) return 'duplicate';
      throw error;
    }
    if (context.recipient.type === 'whatsapp_user' && !authorization) {
      await OutboundMessage.updateOne({ _id: outbound._id }, {
        deliveryStatus: 'failed',
        failedAt: new Date(),
        errorCode: 'WHATSAPP_RECIPIENT_NOT_AUTHORIZED',
        errorMessage: 'No existe evidencia inbound vigente para esta conversación',
        simulatedDelivery: false,
      });
      return 'failed';
    }
    try {
      const result = await selectedProvider.sendMessage({
        userId: context.userId,
        text: context.text,
        recipient: context.recipient,
        whatsappAuthorization: authorization ? {
          mode: authorization.mode,
          recipientId: authorization.recipientId,
          sourceEventId: authorization.sourceEventId,
        } : undefined,
      });
      await OutboundMessage.updateOne({ _id: outbound._id }, { deliveryStatus: result.simulated ? 'simulated' : 'sent', externalMessageId: result.externalMessageId, sentAt: new Date(), simulatedDelivery: result.simulated });
      console.info('Outbound messaging delivery completed', {
        channel,
        provider: selectedProvider.name,
        deliveryStatus: result.simulated ? 'simulated' : 'sent',
      });
      return result.simulated ? 'simulated' : 'sent';
    } catch (error) {
      const providerError = error instanceof MessagingProviderError ? error : new MessagingProviderError('Error inesperado de mensajería', 'MESSAGING_UNKNOWN_ERROR');
      await OutboundMessage.updateOne({ _id: outbound._id }, { deliveryStatus: 'failed', failedAt: new Date(), errorCode: providerError.code, errorMessage: providerError.message, simulatedDelivery: false });
      console.warn('Outbound messaging delivery failed', {
        channel,
        provider: selectedProvider.name,
        errorCode: providerError.code,
        httpStatus: providerError.status,
      });
      return 'failed';
    }
  }

  static async retryFailedYouTube(messageId: string, userId: string): Promise<{ status: string; retryCount: number }> {
    const outbound: any = await OutboundMessage.findOne({ _id: messageId, userId, channel: 'youtube', messageType: 'youtube_reply' });
    if (!outbound) throw new Error('Mensaje fallido no encontrado');
    if (outbound.deliveryStatus !== 'failed') throw new Error('Solo se pueden reintentar mensajes fallidos');
    if (['YOUTUBE_TIMEOUT', 'MESSAGING_UNKNOWN_ERROR', 'YOUTUBE_UNKNOWN_ERROR'].includes(outbound.errorCode || '')) throw new Error('Este fallo es ambiguo y requiere revisión manual para evitar una respuesta duplicada');
    const retryCount = Number(outbound.retryCount || 0);
    if (retryCount >= 3) throw new Error('El mensaje alcanzó el máximo de tres reintentos');
    if (outbound.lastRetryAt && Date.now() - new Date(outbound.lastRetryAt).getTime() < 60000) throw new Error('Espera un minuto antes de volver a intentar');

    const provider = getMessagingProvider('youtube');
    outbound.retryCount = retryCount + 1;
    outbound.lastRetryAt = new Date();
    outbound.deliveryStatus = 'pending';
    await outbound.save();
    try {
      const result = await provider.sendMessage({ userId, text: outbound.text, recipient: { type: 'youtube_comment', parentCommentId: outbound.recipientId } });
      outbound.deliveryStatus = result.simulated ? 'simulated' : 'sent';
      outbound.externalMessageId = result.externalMessageId;
      outbound.sentAt = new Date();
      outbound.failedAt = undefined;
      outbound.errorCode = undefined;
      outbound.errorMessage = undefined;
      outbound.simulatedDelivery = result.simulated;
    } catch (error) {
      const providerError = error instanceof MessagingProviderError ? error : new MessagingProviderError('Error inesperado de mensajería', 'MESSAGING_UNKNOWN_ERROR');
      outbound.deliveryStatus = 'failed';
      outbound.failedAt = new Date();
      outbound.errorCode = providerError.code;
      outbound.errorMessage = providerError.message;
      outbound.simulatedDelivery = false;
    }
    await outbound.save();
    return { status: outbound.deliveryStatus, retryCount: outbound.retryCount };
  }
}
