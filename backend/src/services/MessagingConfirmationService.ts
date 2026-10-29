import OutboundMessage from '../models/OutboundMessage';

type ConfirmationInput = {
  userId: string;
  messageId: string;
  externalMessageId: string;
  evidenceSource: 'provider_webhook' | 'provider_readback';
  confirmedAt?: Date;
};

export class MessagingConfirmationService {
  static async confirm(input: ConfirmationInput) {
    const confirmedAt = input.confirmedAt || new Date();
    return OutboundMessage.findOneAndUpdate(
      {
        _id: input.messageId,
        userId: input.userId,
        externalMessageId: input.externalMessageId,
        deliveryStatus: { $in: ['sent', 'confirmed', 'delivered'] },
        simulatedDelivery: { $ne: true },
      },
      {
        $set: {
          deliveryStatus: 'confirmed',
          confirmedAt,
          lastVerificationAt: confirmedAt,
          confirmationEvidenceSource: input.evidenceSource,
        },
      },
      { new: true }
    );
  }

  static async markUnconfirmed(input: { userId: string; messageId: string; checkedAt?: Date }) {
    const checkedAt = input.checkedAt || new Date();
    return OutboundMessage.findOneAndUpdate(
      {
        _id: input.messageId,
        userId: input.userId,
        deliveryStatus: 'sent',
        simulatedDelivery: { $ne: true },
      },
      { $set: { deliveryStatus: 'unknown', lastVerificationAt: checkedAt } },
      { new: true }
    );
  }
}
