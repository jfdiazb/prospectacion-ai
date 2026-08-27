import { createHash } from 'crypto';
import LaunchYouTubeVideo from '../models/LaunchYouTubeVideo';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchExternalEvent from '../models/LaunchExternalEvent';
import { LaunchExternalEventService } from './LaunchExternalEventService';

export type NormalizedYouTubeLaunchEvent = {
  externalEventId: string;
  commentId: string;
  rootCommentId: string;
  parentCommentId?: string;
  eventType: 'root_comment' | 'thread_reply';
  videoId?: string;
  accountChannelId?: string;
  authorChannelId: string;
  occurredAt: Date;
  text: string;
};
export class YouTubeLaunchAdapter {
  static normalize(
    comment: any,
    responseParentId: string,
    accountChannelId?: string
  ): NormalizedYouTubeLaunchEvent | null {
    const commentId = String(comment?.id || '').trim(),
      text = String(comment?.snippet?.textOriginal || '').trim();
    const authorChannelId = String(comment?.snippet?.authorChannelId?.value || '').trim();
    const occurredAt = new Date(comment?.snippet?.publishedAt || 0);
    if (!commentId || !text || !authorChannelId || Number.isNaN(occurredAt.getTime())) return null;
    const rootCommentId = responseParentId || commentId;
    return {
      externalEventId: `youtube:${commentId}`,
      commentId,
      rootCommentId,
      parentCommentId: rootCommentId === commentId ? undefined : rootCommentId,
      eventType: rootCommentId === commentId ? 'root_comment' : 'thread_reply',
      videoId: comment?.snippet?.videoId ? String(comment.snippet.videoId) : undefined,
      accountChannelId,
      authorChannelId,
      occurredAt,
      text,
    };
  }
  static async hasMappedVideo(userId: string, event: NormalizedYouTubeLaunchEvent) {
    if (event.videoId && event.accountChannelId)
      return Boolean(
        await LaunchYouTubeVideo.exists({
          userId,
          videoId: event.videoId,
          channelId: event.accountChannelId,
          status: 'active',
        })
      );
    if (event.eventType !== 'thread_reply') return false;
    return Boolean(
      await LaunchExternalEvent.exists({
        userId,
        provider: 'youtube',
        externalEventId: `youtube:${event.rootCommentId}`,
        'association.launchId': { $exists: true },
        ...(event.accountChannelId ? { 'metadata.accountChannelId': event.accountChannelId } : {}),
      })
    );
  }
  static async ingest(
    userId: string,
    event: NormalizedYouTubeLaunchEvent,
    context: { leadId: string; conversationId: string }
  ) {
    let mapping: any =
      event.videoId && event.accountChannelId
        ? await LaunchYouTubeVideo.findOne({
            userId,
            videoId: event.videoId,
            channelId: event.accountChannelId,
            status: 'active',
          }).lean()
        : null;
    if (!mapping && event.eventType === 'thread_reply') {
      const root: any = await LaunchExternalEvent.findOne({
        userId,
        provider: 'youtube',
        externalEventId: `youtube:${event.rootCommentId}`,
        status: { $in: ['processed', 'pending_review', 'ignored'] },
      }).lean();
      if (
        root?.association?.launchId &&
        root.metadata?.videoId &&
        (!event.videoId || event.videoId === root.metadata.videoId) &&
        (!event.accountChannelId || event.accountChannelId === root.metadata.accountChannelId)
      )
        mapping = {
          launchId: root.association.launchId,
          _id: root.metadata.mappingId,
          videoId: root.metadata.videoId,
          channelId: root.metadata.accountChannelId,
        };
    }
    const participant: any = mapping
      ? await LaunchParticipant.findOne({
          userId,
          launchId: mapping.launchId,
          leadId: context.leadId,
        }).lean()
      : null;
    const result: any = await LaunchExternalEventService.ingest({
      schemaVersion: 1,
      provider: 'youtube',
      eventType: 'comment',
      externalEventId: event.externalEventId,
      ownerId: userId,
      channel: 'youtube',
      externalAccountId: event.accountChannelId || 'youtube:unresolved',
      externalParticipantId: event.authorChannelId,
      providerTimestamp: event.occurredAt,
      verification: {
        status: 'verified',
        method: 'provider',
        timestampToleranceMs: (() => {
          const configured = Number(process.env.YOUTUBE_LAUNCH_EVENT_TOLERANCE_MS || 3600000);
          return Number.isFinite(configured) ? Math.max(60000, configured) : 3600000;
        })(),
      },
      normalizedPayload: {
        launchId: mapping?.launchId?.toString(),
        participantId: participant?._id?.toString(),
        leadId: participant?.leadId?.toString(),
        conversationId: participant?.conversationId?.toString(),
        contentType: 'comment',
        referenceId: event.rootCommentId,
      },
      evidence: {
        type: 'provider',
        source:
          event.eventType === 'root_comment' ? 'youtube_root_comment' : 'youtube_thread_reply',
        channel: 'youtube',
        referenceId: event.commentId,
        occurredAt: event.occurredAt,
        metadata: {
          provider: 'youtube',
          videoId: event.videoId || mapping?.videoId || null,
          rootCommentId: event.rootCommentId,
          parentCommentId: event.parentCommentId || null,
          commentType: event.eventType,
        },
      },
      metadata: {
        ingestionProfile: 'youtube_launch_v1',
        videoId: event.videoId || mapping?.videoId || null,
        accountChannelId: event.accountChannelId || mapping?.channelId || null,
        rootCommentId: event.rootCommentId,
        commentType: event.eventType,
        mappingId: mapping?._id?.toString() || null,
        contentDigest: createHash('sha256').update(event.text).digest('hex'),
      },
    });
    console.info('YouTube launch inbound adapted', {
      videoId: event.videoId,
      commentId: event.commentId,
      thread: event.rootCommentId,
      launch: result.association?.launchId?.toString() || mapping?.launchId?.toString(),
      status: result.status,
    });
    return result;
  }
}
