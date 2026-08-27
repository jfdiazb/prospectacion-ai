import { createHash } from 'crypto';
import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import { LaunchExternalEventService } from './LaunchExternalEventService';
import type { NormalizedWhatsAppInbound } from './WhatsAppInboundNormalizer';

export class WhatsAppLaunchAdapter {
  static async ingest(
    userId: string,
    event: NormalizedWhatsAppInbound,
    context: { leadId: string; conversationId: string }
  ) {
    let participant: any;
    let launch: any;
    if (event.action) {
      const tokenHash = createHash('sha256').update(event.action.participantToken).digest('hex');
      participant = await LaunchParticipant.findOne({
        userId,
        launchId: event.action.launchId,
        'metadata.externalInboundTokenHash': tokenHash,
      }).lean();
      if (participant) launch = await Launch.findOne({ _id: participant.launchId, userId }).lean();
    } else {
      const matches: any[] = await LaunchParticipant.find({
        userId,
        conversationId: context.conversationId,
      })
        .limit(2)
        .lean();
      if (matches.length === 1) participant = matches[0];
      if (participant) launch = await Launch.findOne({ _id: participant.launchId, userId }).lean();
    }
    const allowedActions: string[] = Array.isArray(
      launch?.registrationConfig?.whatsappInteractiveActions
    )
      ? launch.registrationConfig.whatsappInteractiveActions
      : [];
    let strongAction: 'registration' | 'confirmation' | undefined;
    if (
      participant &&
      event.action &&
      (event.action.action === 'registration' || event.action.action === 'confirmation') &&
      allowedActions.includes(event.action.action)
    )
      strongAction = event.action.action;
    const result: any = await LaunchExternalEventService.ingest({
      schemaVersion: 1,
      provider: 'whatsapp',
      eventType: strongAction || 'direct_message',
      externalEventId: `whatsapp:${event.externalEventId}`,
      ownerId: userId,
      channel: 'whatsapp',
      externalAccountId: event.phoneNumberId,
      externalParticipantId: event.waId,
      providerTimestamp: event.occurredAt,
      verification: {
        status: 'verified',
        method: 'hmac',
        timestampToleranceMs: Math.max(
          60000,
          Number(process.env.WHATSAPP_INBOUND_MAX_AGE_MS || 600000)
        ),
      },
      normalizedPayload: {
        launchId: participant?.launchId?.toString() || event.action?.launchId,
        participantId: participant?._id?.toString(),
        leadId: participant?.leadId?.toString(),
        conversationId: participant?.conversationId?.toString(),
        registrationStatus: strongAction === 'registration' ? 'registered' : undefined,
        confirmationStatus: strongAction === 'confirmation' ? 'confirmed' : undefined,
        contentType: 'direct_message',
        referenceId: event.externalEventId,
      },
      evidence: {
        type: 'webhook',
        source: `whatsapp_${event.messageType}`,
        channel: 'whatsapp',
        referenceId: event.externalEventId,
        occurredAt: event.occurredAt,
        metadata: {
          provider: 'whatsapp',
          method: event.messageType,
          phoneNumberId: event.phoneNumberId,
          contextMessageId: event.contextMessageId || null,
          mediaType: event.media?.type || null,
        },
      },
      metadata: {
        ingestionProfile: 'whatsapp_launch_v1',
        messageType: event.messageType,
        interactiveAction: event.action?.action || null,
        actionAuthorized: Boolean(strongAction),
        contentDigest: createHash('sha256').update(event.text).digest('hex'),
      },
    });
    console.info('WhatsApp launch inbound adapted', {
      messageId: event.externalEventId,
      phoneNumberId: event.phoneNumberId,
      eventType: event.messageType,
      launch: result.association?.launchId?.toString() || participant?.launchId?.toString(),
      status: result.status,
    });
    return result;
  }
}
