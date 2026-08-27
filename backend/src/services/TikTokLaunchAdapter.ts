import { createHash } from 'crypto';
import type { NormalizedTikTokEvent } from '../integrations/tiktok';
import LaunchExternalEvent from '../models/LaunchExternalEvent';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchTikTokContent from '../models/LaunchTikTokContent';
import { LaunchExternalEventService } from './LaunchExternalEventService';

export class TikTokLaunchAdapter {
  static isSupported(event: NormalizedTikTokEvent) {
    return event.eventType === 'comment' && Boolean(event.commentId);
  }

  static async hasMappedContent(userId: string, event: NormalizedTikTokEvent) {
    if (!this.isSupported(event) || !event.mediaId || !event.accountId) return false;
    return Boolean(
      await LaunchTikTokContent.exists({
        userId,
        accountId: event.accountId,
        contentId: event.mediaId,
        status: 'active',
      })
    );
  }

  static async ingest(
    userId: string,
    event: NormalizedTikTokEvent,
    context: { leadId: string; conversationId: string }
  ) {
    const mapping: any =
      this.isSupported(event) && event.mediaId && event.accountId
        ? await LaunchTikTokContent.findOne({
            userId,
            accountId: event.accountId,
            contentId: event.mediaId,
            status: 'active',
          }).lean()
        : null;
    const participant: any = mapping
      ? await LaunchParticipant.findOne({
          userId,
          launchId: mapping.launchId,
          leadId: context.leadId,
        }).lean()
      : null;
    const configured = Number(process.env.TIKTOK_LAUNCH_EVENT_TOLERANCE_MS || 3600000);
    const result: any = await LaunchExternalEventService.ingest({
      schemaVersion: 1,
      provider: 'tiktok',
      eventType: 'comment',
      externalEventId: `tiktok:${event.externalEventId}`,
      ownerId: userId,
      channel: 'tiktok',
      externalAccountId: event.accountId || 'tiktok:unresolved',
      externalParticipantId: event.senderId,
      providerTimestamp: event.occurredAt,
      verification: {
        status: 'verified',
        method: 'provider',
        timestampToleranceMs: Number.isFinite(configured) ? Math.max(60000, configured) : 3600000,
      },
      normalizedPayload: {
        launchId: mapping?.launchId?.toString(),
        participantId: participant?._id?.toString(),
        leadId: participant?.leadId?.toString(),
        conversationId: participant?.conversationId?.toString(),
        contentType: 'comment',
        referenceId: event.commentId || event.externalEventId,
      },
      evidence: {
        type: 'provider',
        source: 'tiktok_owned_video_comment',
        channel: 'tiktok',
        referenceId: event.commentId || event.externalEventId,
        occurredAt: event.occurredAt,
        metadata: {
          provider: 'tiktok',
          contentId: event.mediaId || null,
          commentId: event.commentId || null,
        },
      },
      metadata: {
        ingestionProfile: 'tiktok_launch_v1',
        eventKind: event.eventType,
        contentId: event.mediaId || null,
        commentId: event.commentId || null,
        accountId: event.accountId || null,
        mappingId: mapping?._id?.toString() || null,
        contentDigest: createHash('sha256').update(event.text).digest('hex'),
      },
    });
    console.info('TikTok launch inbound adapted', {
      eventType: event.eventType,
      contentId: event.mediaId,
      commentId: event.commentId,
      launch: result.association?.launchId?.toString() || mapping?.launchId?.toString(),
      status: result.status,
    });
    return result;
  }
}
