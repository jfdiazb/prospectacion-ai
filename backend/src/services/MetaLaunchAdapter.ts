import { createHash } from 'crypto';
import type { NormalizedMetaEvent } from '../integrations/meta';
import LaunchMetaContent from '../models/LaunchMetaContent';
import LaunchParticipant from '../models/LaunchParticipant';
import ContactIdentity from '../models/ContactIdentity';
import { LaunchExternalEventService } from './LaunchExternalEventService';

export class MetaLaunchAdapter {
  static async hasMappedContent(userId: string, event: NormalizedMetaEvent) {
    if (!event.accountId || !event.externalContentId) return false;
    return Boolean(
      await LaunchMetaContent.exists({
        userId,
        platform: event.platform,
        accountId: event.accountId,
        contentId: event.externalContentId,
        status: 'active',
      })
    );
  }

  static async ingest(
    userId: string,
    event: NormalizedMetaEvent,
    context: { leadId: string; conversationId: string }
  ) {
    const mapping: any =
      event.accountId && event.externalContentId
        ? await LaunchMetaContent.findOne({
            userId,
            platform: event.platform,
            accountId: event.accountId,
            contentId: event.externalContentId,
            status: 'active',
          }).lean()
        : null;
    let participant: any;
    if (mapping) {
      participant = await this.participantForLead(
        userId,
        mapping.launchId.toString(),
        context.leadId
      );
    } else if (event.launchParticipantToken) {
      const tokenHash = createHash('sha256').update(event.launchParticipantToken).digest('hex');
      const matches: any[] = await LaunchParticipant.find({
        userId,
        'metadata.externalInboundTokenHash': tokenHash,
      })
        .limit(2)
        .lean();
      if (matches.length === 1) participant = matches[0];
    } else if (event.eventType === 'direct_message') {
      const matches: any[] = await LaunchParticipant.find({
        userId,
        conversationId: context.conversationId,
      })
        .limit(2)
        .lean();
      if (matches.length === 1) participant = matches[0];
    }
    const launchId = mapping?.launchId?.toString() || participant?.launchId?.toString();
    const configuredTolerance = Number(process.env.META_LAUNCH_EVENT_TOLERANCE_MS || 600000);
    const toleranceMs = Number.isFinite(configuredTolerance)
      ? Math.max(60000, configuredTolerance)
      : 600000;
    const result: any = await LaunchExternalEventService.ingest({
      schemaVersion: 1,
      provider: 'meta',
      eventType: event.eventType,
      externalEventId: event.externalEventId,
      ownerId: userId,
      channel: event.platform,
      externalAccountId: event.accountId || event.recipientId || `${event.platform}:unresolved`,
      externalParticipantId: event.externalUserId,
      providerTimestamp: event.occurredAt,
      verification: { status: 'verified', method: 'hmac', timestampToleranceMs: toleranceMs },
      normalizedPayload: {
        launchId,
        participantId: participant?._id?.toString(),
        leadId: participant?.leadId?.toString(),
        conversationId: participant?.conversationId?.toString(),
        contentType: event.eventType,
        referenceId: event.commentId || event.messageId || event.externalEventId,
      },
      evidence: {
        type: 'webhook',
        source: event.source,
        channel: event.platform,
        referenceId: event.commentId || event.messageId || event.externalEventId,
        occurredAt: event.occurredAt,
        metadata: {
          provider: 'meta',
          eventType: event.eventType,
          accountId: event.accountId || null,
          contentId: event.externalContentId || null,
          privateReplyCommentId: event.privateReplyCommentId || null,
        },
      },
      metadata: {
        ingestionProfile: 'meta_launch_v1',
        metaType: event.eventType,
        accountId: event.accountId || null,
        contentId: event.externalContentId || null,
        mappingId: mapping?._id?.toString() || null,
        privateReplyContext: Boolean(event.privateReplyCommentId),
        contentDigest: createHash('sha256').update(event.content).digest('hex'),
      },
    });
    console.info('Meta launch inbound adapted', {
      metaType: event.eventType,
      platform: event.platform,
      accountId: event.accountId,
      externalEventId: event.externalEventId,
      launch: result.association?.launchId?.toString() || launchId,
      status: result.status,
    });
    return result;
  }

  private static async participantForLead(userId: string, launchId: string, leadId: string) {
    const direct: any = await LaunchParticipant.findOne({ userId, launchId, leadId }).lean();
    if (direct) return direct;
    const identity: any = await ContactIdentity.findOne({
      userId,
      leadId,
      status: 'active',
    }).lean();
    if (!identity || ['opted_out', 'blocked'].includes(identity.consentStatus)) return null;
    return LaunchParticipant.findOne({ userId, launchId, contactId: identity.contactId }).lean();
  }
}
