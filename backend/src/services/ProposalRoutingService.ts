import type { MessagingRecipient } from '../integrations/messaging';

export type ProposalChannel = 'whatsapp' | 'instagram' | 'facebook';
export type ProposalDeliveryStatus = 'sent' | 'simulated' | 'failed' | 'unknown' | 'duplicate';

const supported = (value: unknown): value is ProposalChannel =>
  value === 'whatsapp' || value === 'instagram' || value === 'facebook';

const recipientChannel = (type: unknown): ProposalChannel | null => {
  if (type === 'whatsapp_user') return 'whatsapp';
  if (type === 'instagram_user' || type === 'instagram_comment') return 'instagram';
  if (type === 'facebook_user' || type === 'facebook_comment') return 'facebook';
  return null;
};

const conversationChannel = (conversation: any): ProposalChannel | null => {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (supported(messages[index]?.platform)) return messages[index].platform;
  }
  return null;
};

const latestInboundMessage = (conversation: any): any | null => {
  const messages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.sender === 'lead' || message?.direction === 'inbound') return message;
  }
  return null;
};

const inferredEventType = (message: any): 'comment' | 'direct_message' | undefined => {
  if (message?.eventType === 'comment' || message?.eventType === 'direct_message') return message.eventType;
  if (String(message?.source || '').includes('comment')) return 'comment';
  if (String(message?.source || '').includes('direct_message')) return 'direct_message';
  if (/^meta:facebook:m_/i.test(String(message?.externalMessageId || ''))) return 'direct_message';
  return undefined;
};

const expectedRecipientType = (message: any): string | undefined => {
  const platform = supported(message?.platform) ? message.platform : undefined;
  const eventType = inferredEventType(message);
  if (!platform || !eventType || platform === 'whatsapp') return platform === 'whatsapp' ? 'whatsapp_user' : undefined;
  return `${platform}_${eventType === 'comment' ? 'comment' : 'user'}`;
};

const recipientFor = (proposal: any): MessagingRecipient | null => {
  const type = proposal?.recipient?.type;
  const externalId = proposal?.recipient?.externalId;
  if (!externalId) return null;
  if (type === 'whatsapp_user') return { type, phoneNumber: externalId };
  if (type === 'instagram_user') return { type, instagramScopedId: externalId };
  if (type === 'instagram_comment') return { type, commentId: externalId };
  if (type === 'facebook_user') return { type, pageScopedId: externalId };
  if (type === 'facebook_comment') return { type, commentId: externalId };
  return null;
};

export class ProposalRoutingError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ProposalRoutingError';
  }
}

export class ProposalRoutingService {
  static currentInboundContext(conversation: any) {
    const inbound = latestInboundMessage(conversation);
    if (!inbound) return undefined;
    return {
      externalMessageId: inbound.externalMessageId,
      eventType: inferredEventType(inbound),
      source: inbound.source,
      platform: inbound.platform,
      timestamp: inbound.timestamp,
    };
  }

  static isCurrentForConversation(proposal: any, conversation: any): boolean {
    const inbound = latestInboundMessage(conversation);
    if (!inbound) return true;
    const inboundId = String(inbound.externalMessageId || '');
    const linkedInboundId = String(proposal?.contextSnapshot?.lastLeadMessageId || proposal?.sourceEventId || '');
    const explicitlyLinked = Boolean(inboundId && linkedInboundId === inboundId);
    const proposalCreatedAt = new Date(proposal?.createdAt || 0).getTime();
    const inboundAt = new Date(inbound.timestamp || 0).getTime();
    const createdAfterInbound = Number.isFinite(proposalCreatedAt) && Number.isFinite(inboundAt) && proposalCreatedAt >= inboundAt;
    const expectedType = expectedRecipientType(inbound);
    const compatibleRecipient = !expectedType || proposal?.recipient?.type === expectedType;
    return compatibleRecipient && (explicitlyLinked || createdAfterInbound);
  }

  static resolve(proposal: any, conversation: any): { channel: ProposalChannel; recipient: MessagingRecipient } {
    if (!this.isCurrentForConversation(proposal, conversation))
      throw new ProposalRoutingError('La propuesta corresponde a un mensaje anterior de la conversaciÃ³n', 'PROPOSAL_SUPERSEDED_BY_INBOUND');
    const recipient = recipientFor(proposal);
    if (!recipient)
      throw new ProposalRoutingError('La propuesta no conserva un destinatario oficial válido', 'PROPOSAL_RECIPIENT_MISSING');

    const currentChannel = conversationChannel(conversation);
    const storedChannel = supported(proposal?.platform) ? proposal.platform : null;
    const destinationChannel = recipientChannel(proposal?.recipient?.type);
    const channel = currentChannel || storedChannel || destinationChannel;
    if (!channel || destinationChannel !== channel)
      throw new ProposalRoutingError('El destinatario de la propuesta no coincide con el canal actual de la conversación', 'PROPOSAL_CHANNEL_MISMATCH');
    if (storedChannel && storedChannel !== channel)
      throw new ProposalRoutingError('El canal persistido de la propuesta no coincide con la conversación', 'PROPOSAL_CHANNEL_MISMATCH');

    return { channel, recipient };
  }

  static proposalStatus(deliveryStatus: ProposalDeliveryStatus): 'sent' | 'simulated' | 'failed' {
    if (deliveryStatus === 'sent') return 'sent';
    if (deliveryStatus === 'simulated') return 'simulated';
    return 'failed';
  }
}
