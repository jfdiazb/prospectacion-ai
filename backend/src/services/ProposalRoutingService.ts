import type { MessagingRecipient } from '../integrations/messaging';

export type ProposalChannel = 'whatsapp' | 'instagram' | 'facebook';
export type ProposalDeliveryStatus = 'sent' | 'simulated' | 'failed' | 'duplicate';

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
  static resolve(proposal: any, conversation: any): { channel: ProposalChannel; recipient: MessagingRecipient } {
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
