import Conversation from '../models/Conversation';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';

export type WhatsAppAuthorizationEvidence = {
  mode: 'static_allowlist' | 'inbound_conversation';
  channel: 'whatsapp';
  recipientId: string;
  conversationId: string;
  authorizedAt: Date;
  sourceEventId?: string;
  inboundAt?: Date;
};

type AuthorizationContext = {
  userId: string;
  leadId: string;
  conversationId: string;
  phoneNumber: string;
};

export class WhatsAppOutboundAuthorizationService {
  static normalizePhone(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
  }

  static async authorize(context: AuthorizationContext): Promise<WhatsAppAuthorizationEvidence | null> {
    const recipientId = this.normalizePhone(context.phoneNumber);
    if (!recipientId) return null;
    const allowlist = (process.env.WHATSAPP_ACTIVATION_ALLOWLIST || '')
      .split(',')
      .map(this.normalizePhone)
      .filter(Boolean);
    if (allowlist.includes(recipientId))
      return {
        mode: 'static_allowlist',
        channel: 'whatsapp',
        recipientId,
        conversationId: context.conversationId,
        authorizedAt: new Date(),
      };

    const lead: any = await Lead.findOne({
      _id: context.leadId,
      userId: context.userId,
      phone: recipientId,
      platform: 'whatsapp',
      status: { $ne: 'rejected' },
    }).select('_id').lean();
    if (!lead) return null;

    const windowMs = 24 * 60 * 60 * 1000;
    const candidates: any[] = await InboundEvent.find({
      userId: context.userId,
      channel: 'whatsapp',
      senderId: recipientId,
      accountId: process.env.WHATSAPP_PHONE_NUMBER_ID,
      eventTimestamp: { $gte: new Date(Date.now() - windowMs), $lte: new Date(Date.now() + 60000) },
      conversationRecordedAt: { $exists: true },
      processingState: { $in: ['processing', 'completed'] },
    })
      .sort({ eventTimestamp: -1 })
      .limit(20)
      .select('externalEventId eventTimestamp')
      .lean();

    for (const inbound of candidates) {
      const belongsToConversation = await Conversation.exists({
        _id: context.conversationId,
        userId: context.userId,
        leadId: context.leadId,
        messages: {
          $elemMatch: {
            platform: 'whatsapp',
            direction: 'inbound',
            externalMessageId: inbound.externalEventId,
          },
        },
      });
      if (belongsToConversation)
        return {
          mode: 'inbound_conversation',
          channel: 'whatsapp',
          recipientId,
          conversationId: context.conversationId,
          authorizedAt: new Date(),
          sourceEventId: inbound.externalEventId,
          inboundAt: inbound.eventTimestamp,
        };
    }
    return null;
  }
}
