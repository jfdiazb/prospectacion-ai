import axios, { type AxiosInstance } from 'axios';
import YouTubeCredential from '../models/YouTubeCredential';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import OutboundMessage from '../models/OutboundMessage';
import Conversation from '../models/Conversation';
import YouTubeThreadCheckpoint from '../models/YouTubeThreadCheckpoint';
import { LeadService } from './LeadService';
import { ConversationService } from './ConversationService';
import { AlmaService } from './AlmaService';
import { AutomationService } from './AutomationService';
import { AutomationEngineService } from './AutomationEngineService';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';
import { YouTubeLaunchAdapter } from './YouTubeLaunchAdapter';
import { YouTubeOptOutService } from './YouTubeOptOutService';

type TopComment = {
  id: string;
  snippet?: {
    textOriginal?: string;
    authorDisplayName?: string;
    authorChannelId?: { value?: string };
    videoId?: string;
    publishedAt?: string;
  };
};
type ThreadResponse = { items?: Array<{ snippet?: { topLevelComment?: TopComment } }> };
type CommentListResponse = { items?: TopComment[]; nextPageToken?: string };
type CommentProcessingResult =
  | 'processed'
  | 'processing_failed'
  | 'invalid'
  | 'own_channel'
  | 'not_eligible'
  | 'duplicate';
type ReplyPollingSummary = Record<CommentProcessingResult, number> & {
  outboundCandidates: number;
  activeThreads: number;
  polledThreads: number;
  coverageCycleCount: number;
  urgentThreads: number;
  threadFailures: number;
  pages: number;
  replies: number;
};

export class YouTubeIngestionService {
  constructor(
    private readonly http: AxiosInstance = axios,
    private readonly tokens = new YouTubeTokenService(http)
  ) {}

  static getApiFailure(error: unknown): { httpStatus?: number; reason: string } {
    if (!axios.isAxiosError(error))
      return { reason: error instanceof Error ? error.name : 'unknown' };
    const data = error.response?.data as any;
    const reason =
      (typeof data?.error === 'string' ? data.error : undefined) ||
      data?.error?.errors?.[0]?.reason ||
      data?.error?.details?.[0]?.reason ||
      data?.error?.status ||
      error.code ||
      'api_error';
    return { httpStatus: error.response?.status, reason: String(reason).slice(0, 80) };
  }

  async pollAll(): Promise<number> {
    const credentials: any[] = await YouTubeCredential.find({});
    for (const credential of credentials) {
      try {
        await this.pollCredential(credential);
      } catch (error) {
        const apiFailure = YouTubeIngestionService.getApiFailure(error);
        const operation = ['invalid_grant', 'invalid_client'].includes(apiFailure.reason)
          ? 'oauth_refresh'
          : 'comment_threads_list';
        const failure = { ...apiFailure, operation, recordedAt: new Date() };
        credential.lastPollingFailure = failure;
        await credential.save().catch(() => undefined);
        console.error('YouTube polling error', {
          userId: credential.userId.toString(),
          httpStatus: failure.httpStatus,
          reason: failure.reason,
          operation: failure.operation,
        });
      }
    }
    return credentials.length;
  }

  async pollCredential(credential: any): Promise<void> {
    const token = await this.tokens.getAccessToken(credential.userId.toString());
    const params = new URLSearchParams({
      part: 'snippet',
      allThreadsRelatedToChannelId: credential.channelId,
      order: 'time',
      maxResults: '100',
      textFormat: 'plainText',
    });
    const response = await this.http.get<ThreadResponse>(
      `https://www.googleapis.com/youtube/v3/commentThreads?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
      }
    );
    const cutoff = YouTubeIngestionService.getPollingCutoff(credential);
    const comments = (response.data.items ?? [])
      .map(item => item.snippet?.topLevelComment)
      .filter((item): item is TopComment => Boolean(item));
    const summary: Record<CommentProcessingResult, number> = {
      processed: 0,
      processing_failed: 0,
      invalid: 0,
      own_channel: 0,
      not_eligible: 0,
      duplicate: 0,
    };
    let afterCutoff = 0;
    comments.sort(
      (a, b) =>
        new Date(a.snippet?.publishedAt ?? 0).getTime() -
        new Date(b.snippet?.publishedAt ?? 0).getTime()
    );
    for (const comment of comments) {
      if (new Date(comment.snippet?.publishedAt ?? 0).getTime() <= cutoff) continue;
      afterCutoff += 1;
      const result = await this.processComment(
        credential.userId.toString(),
        comment,
        comment.id,
        credential.channelId
      );
      summary[result] += 1;
    }
    if (YouTubeIngestionService.shouldPollReplies(credential)) {
      const replySummary = await this.pollRecentReplies(credential, token);
      console.info('YouTube reply polling summary', replySummary);
      credential.lastReplyPollingSummary = { ...replySummary, recordedAt: new Date() };
      credential.lastRepliesPolledAt = new Date();
    }
    credential.lastPolledAt = new Date();
    const credentialSummary = {
      receivedThreads: response.data.items?.length ?? 0,
      topLevelComments: comments.length,
      cutoffAt: new Date(cutoff).toISOString(),
      afterCutoff,
      ...summary,
    };
    credential.lastPollingSummary = { ...credentialSummary, recordedAt: new Date() };
    credential.lastPollingFailure = undefined;
    await credential.save();
    console.info('YouTube credential polling summary', credentialSummary);
  }

  static shouldPollReplies(credential: { lastRepliesPolledAt?: Date }, now = Date.now()): boolean {
    const intervalMs = Math.max(
      60000,
      Number(process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS || 120000)
    );
    return (
      !credential.lastRepliesPolledAt ||
      now - credential.lastRepliesPolledAt.getTime() >= intervalMs
    );
  }

  async pollRecentReplies(credential: any, token: string): Promise<ReplyPollingSummary> {
    const activeDays = Math.max(1, Number(process.env.YOUTUBE_REPLY_ACTIVE_DAYS || 7));
    const maxThreads = Math.max(8, Number(process.env.YOUTUBE_REPLY_MAX_THREADS || 8));
    const inventory = await OutboundMessage.aggregate([
      {
        $match: {
          userId: credential.userId,
          channel: 'youtube',
          messageType: 'youtube_reply',
          recipientId: { $exists: true, $ne: '' },
          createdAt: { $gte: new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000) },
        },
      },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$recipientId',
          lastOutboundAt: { $first: '$createdAt' },
          conversationId: { $first: '$conversationId' },
          outboundCount: { $sum: 1 },
        },
      },
      { $sort: { lastOutboundAt: -1 } },
    ]);
    const conversationIds = inventory.map((item: any) => item.conversationId).filter(Boolean);
    const [conversations, checkpoints] = await Promise.all([
      Conversation.find({ _id: { $in: conversationIds } })
        .slice('messages', -1)
        .select('messages')
        .lean(),
      YouTubeThreadCheckpoint.find({
        userId: credential.userId,
        threadId: { $in: inventory.map((item: any) => item._id) },
      })
        .select('threadId lastCheckedAt')
        .lean(),
    ]);
    const lastSenderByConversation = new Map(
      conversations.map((item: any) => [item._id.toString(), item.messages?.[0]?.sender])
    );
    const lastCheckedByThread = new Map(
      checkpoints.map((item: any) => [item.threadId, item.lastCheckedAt])
    );
    const candidates = YouTubeIngestionService.prioritizeReplyThreads(
      inventory.map((item: any) => ({
        threadId: item._id,
        urgent: lastSenderByConversation.get(item.conversationId?.toString()) === 'lead',
        lastCheckedAt: lastCheckedByThread.get(item._id),
        lastOutboundAt: item.lastOutboundAt,
      }))
    );
    const outboundCandidates = inventory.reduce(
      (total: number, item: any) => total + Number(item.outboundCount || 0),
      0
    );
    const threadIds = candidates.slice(0, maxThreads);
    const summary: ReplyPollingSummary = {
      outboundCandidates,
      activeThreads: candidates.length,
      polledThreads: threadIds.length,
      coverageCycleCount: Math.max(1, Math.ceil(candidates.length / maxThreads)),
      urgentThreads: inventory.filter(
        (item: any) => lastSenderByConversation.get(item.conversationId?.toString()) === 'lead'
      ).length,
      threadFailures: 0,
      pages: 0,
      replies: 0,
      processed: 0,
      processing_failed: 0,
      invalid: 0,
      own_channel: 0,
      not_eligible: 0,
      duplicate: 0,
    };
    for (const threadId of threadIds) {
      let threadSummary;
      try {
        threadSummary = await this.pollThreadReplies(credential, token, threadId);
        await YouTubeThreadCheckpoint.findOneAndUpdate(
          { userId: credential.userId, threadId },
          {
            $set: {
              lastCheckedAt: new Date(),
              lastSucceededAt: new Date(),
              consecutiveFailures: 0,
            },
            $unset: { lastFailedAt: 1 },
          },
          { upsert: true }
        );
      } catch (error) {
        summary.threadFailures += 1;
        await YouTubeThreadCheckpoint.findOneAndUpdate(
          { userId: credential.userId, threadId },
          {
            $set: { lastCheckedAt: new Date(), lastFailedAt: new Date() },
            $inc: { consecutiveFailures: 1 },
          },
          { upsert: true }
        );
        console.error('YouTube thread polling failed', {
          message: error instanceof Error ? error.message : 'unknown',
        });
        continue;
      }
      summary.pages += threadSummary.pages;
      summary.replies += threadSummary.replies;
      summary.processed += threadSummary.processed;
      summary.processing_failed += threadSummary.processing_failed;
      summary.invalid += threadSummary.invalid;
      summary.own_channel += threadSummary.own_channel;
      summary.not_eligible += threadSummary.not_eligible;
      summary.duplicate += threadSummary.duplicate;
    }
    return summary;
  }

  static prioritizeReplyThreads(
    candidates: Array<{
      threadId: string;
      urgent?: boolean;
      lastCheckedAt?: Date;
      lastOutboundAt?: Date;
    }>
  ): string[] {
    return [...candidates]
      .sort((a, b) => {
        if (Boolean(a.urgent) !== Boolean(b.urgent)) return a.urgent ? -1 : 1;
        const checkedDifference =
          (a.lastCheckedAt?.getTime() ?? 0) - (b.lastCheckedAt?.getTime() ?? 0);
        if (checkedDifference !== 0) return checkedDifference;
        return (b.lastOutboundAt?.getTime() ?? 0) - (a.lastOutboundAt?.getTime() ?? 0);
      })
      .map(item => item.threadId);
  }

  static selectReplyThreads(
    threadIds: string[],
    maxThreads: number,
    now = Date.now(),
    intervalMs = 120000
  ): string[] {
    if (threadIds.length <= maxThreads) return threadIds;
    const start = (Math.floor(now / intervalMs) * maxThreads) % threadIds.length;
    return Array.from(
      { length: maxThreads },
      (_, index) => threadIds[(start + index) % threadIds.length]
    );
  }

  async pollThreadReplies(
    credential: any,
    token: string,
    threadId: string
  ): Promise<
    Omit<
      ReplyPollingSummary,
      | 'outboundCandidates'
      | 'activeThreads'
      | 'polledThreads'
      | 'coverageCycleCount'
      | 'urgentThreads'
      | 'threadFailures'
    >
  > {
    let pageToken: string | undefined;
    const summary = {
      pages: 0,
      replies: 0,
      processed: 0,
      processing_failed: 0,
      invalid: 0,
      own_channel: 0,
      not_eligible: 0,
      duplicate: 0,
    };
    do {
      const params = new URLSearchParams({
        part: 'snippet',
        parentId: threadId,
        maxResults: '100',
        textFormat: 'plainText',
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.http.get<CommentListResponse>(
        `https://www.googleapis.com/youtube/v3/comments?${params}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
        }
      );
      const replies = response.data.items ?? [];
      summary.pages += 1;
      summary.replies += replies.length;
      replies.sort(
        (a, b) =>
          new Date(a.snippet?.publishedAt ?? 0).getTime() -
          new Date(b.snippet?.publishedAt ?? 0).getTime()
      );
      for (const reply of replies) {
        const result = await this.processComment(
          credential.userId.toString(),
          reply,
          threadId,
          credential.channelId
        );
        summary[result] += 1;
      }
      pageToken = response.data.nextPageToken;
    } while (pageToken);
    return summary;
  }

  static getPollingCutoff(credential: { connectedAt?: Date; lastPolledAt?: Date }): number {
    const connectedAt = credential.connectedAt?.getTime() ?? 0;
    const lastPolledAt = credential.lastPolledAt?.getTime();
    if (!lastPolledAt) return connectedAt;
    const overlapMs = Math.max(0, Number(process.env.YOUTUBE_POLL_OVERLAP_MS || 60 * 60 * 1000));
    return Math.max(connectedAt, lastPolledAt - overlapMs);
  }

  async processComment(
    userId: string,
    comment: TopComment,
    responseParentId = comment.id,
    ownChannelId?: string
  ): Promise<CommentProcessingResult> {
    const text = comment.snippet?.textOriginal?.trim();
    const senderId = comment.snippet?.authorChannelId?.value;
    if (!text || !senderId || !comment.id) return 'invalid';
    if (ownChannelId && senderId === ownChannelId) return 'own_channel';
    const hasInfoKeyword = /(^|\s)info(\s|$)/i.test(text);
    const automation = await AutomationService.findMatchingKeywordFlow(userId, text);
    const automationReply = AutomationService.getReply(automation);
    const existingLead = await Lead.findOne({ userId, username: senderId, platform: 'youtube' });
    const launchEvent = YouTubeLaunchAdapter.normalize(comment, responseParentId, ownChannelId);
    const hasLaunchMapping = launchEvent
      ? await YouTubeLaunchAdapter.hasMappedVideo(userId, launchEvent)
      : false;
    if (!existingLead && !hasInfoKeyword && !automationReply && !hasLaunchMapping)
      return 'not_eligible';
    const sourceEventId = `youtube:${comment.id}`;
    const claimed = await this.claimComment({
      userId,
      sourceEventId,
      senderId,
      text,
      mediaId: comment.snippet?.videoId,
      matchedKeyword: automation?.trigger?.keyword || (hasInfoKeyword ? 'INFO' : undefined),
    });
    if (!claimed) return 'duplicate';
    try {
      let lead = existingLead;
      const isNewLead = !lead;
      if (!lead) {
        const keyword =
          automation?.trigger?.keyword || (hasInfoKeyword ? 'INFO' : 'launch_interaction');
        const created = await LeadService.createLead(userId, {
          username: senderId,
          fullName: comment.snippet?.authorDisplayName,
          platform: 'youtube',
          source: automation
            ? 'youtube_automation'
            : hasInfoKeyword
              ? 'youtube_info'
              : 'youtube_launch',
          status: 'new',
          tags: [keyword],
        });
        lead = await Lead.findById(created._id);
      }
      if (!lead) throw new Error('No fue posible crear el lead de YouTube');
      const conversation = await ConversationService.getOrCreateConversation(
        userId,
        lead._id.toString()
      );
      if (!claimed.conversationRecordedAt) {
        await ConversationService.addMessage(conversation._id.toString(), userId, {
          sender: 'lead',
          text,
          platform: 'youtube',
        });
        await InboundEvent.updateOne(
          { _id: claimed._id },
          { $set: { conversationRecordedAt: new Date() } }
        );
      }
      const explicitOptOut = YouTubeOptOutService.matches(text);
      if (explicitOptOut)
        await YouTubeOptOutService.apply(
          userId,
          lead._id.toString(),
          sourceEventId,
          launchEvent?.occurredAt || new Date()
        );
      let launchProjection: any;
      if (launchEvent && hasLaunchMapping)
        launchProjection = await YouTubeLaunchAdapter.ingest(userId, launchEvent, {
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
        });
      if (explicitOptOut || launchProjection) {
        await InboundEvent.updateOne(
          { _id: claimed._id },
          {
            $set: { processingState: 'completed', processedAt: new Date() },
            $unset: { retryAfter: 1, processingFailedAt: 1 },
          }
        );
        return 'processed';
      }
      await AlmaService.processMessage({
        userId,
        leadId: lead._id.toString(),
        conversationId: conversation._id.toString(),
        text,
        isNewLead,
        platform: 'youtube',
        sourceEventId,
        recipient: { type: 'youtube_comment', parentCommentId: responseParentId },
        automation:
          automation && automationReply
            ? { flowId: automation._id.toString(), response: automationReply }
            : undefined,
      });
      await AutomationEngineService.emitMessageEvents(
        {
          eventId: sourceEventId,
          userId,
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
          platform: 'youtube',
          source: automation ? 'youtube_automation' : 'youtube_info',
          text,
          recipient: { type: 'youtube_comment', externalId: responseParentId },
          data: {
            score: lead.score,
            interestLevel: lead.interestLevel,
            status: lead.status,
            tags: lead.tags,
          },
        },
        false
      );
      await InboundEvent.updateOne(
        { _id: claimed._id },
        {
          $set: { processingState: 'completed', processedAt: new Date() },
          $unset: { retryAfter: 1, processingFailedAt: 1 },
        }
      );
      return 'processed';
    } catch (error) {
      const retryDelayMs = Math.max(
        60000,
        Number(process.env.YOUTUBE_EVENT_RETRY_DELAY_MS || 60000)
      );
      await InboundEvent.updateOne(
        { _id: claimed._id },
        {
          $set: {
            processingState: 'failed',
            processingFailedAt: new Date(),
            retryAfter: new Date(Date.now() + retryDelayMs),
          },
        }
      );
      console.error('YouTube comment processing failed', {
        attempt: claimed.processingAttempts,
        message: error instanceof Error ? error.message : 'unknown',
      });
      return 'processing_failed';
    }
  }

  private async claimComment(input: {
    userId: string;
    sourceEventId: string;
    senderId: string;
    text: string;
    mediaId?: string;
    matchedKeyword?: string;
  }): Promise<any | null> {
    const now = new Date();
    const initialClaim: any = await InboundEvent.findOneAndUpdate(
      { userId: input.userId, externalEventId: input.sourceEventId },
      {
        $setOnInsert: {
          userId: input.userId,
          externalEventId: input.sourceEventId,
          channel: 'youtube',
          eventType: 'comment',
          senderId: input.senderId,
          text: input.text,
          mediaId: input.mediaId,
          matchedKeyword: input.matchedKeyword,
          processingState: 'processing',
          processingStartedAt: now,
          processingAttempts: 1,
        },
      },
      { upsert: true, new: true, includeResultMetadata: true }
    );
    if (!initialClaim.lastErrorObject?.updatedExisting) return initialClaim.value;

    if (await OutboundMessage.exists({ userId: input.userId, sourceEventId: input.sourceEventId }))
      return null;
    const legacyRetryAt = new Date(
      now.getTime() - Math.max(60000, Number(process.env.YOUTUBE_EVENT_RETRY_DELAY_MS || 60000))
    );
    const claimed = await InboundEvent.findOneAndUpdate(
      {
        userId: input.userId,
        externalEventId: input.sourceEventId,
        $or: [
          { processingState: 'failed', retryAfter: { $lte: now } },
          { processingState: { $exists: false }, createdAt: { $lte: legacyRetryAt } },
        ],
      },
      {
        $set: { processingState: 'processing', processingStartedAt: now },
        $inc: { processingAttempts: 1 },
      },
      { new: true }
    );
    return claimed;
  }
}

let timer: NodeJS.Timeout | undefined;
let polling = false;
export const isYouTubePollingEnabled = (): boolean =>
  (process.env.YOUTUBE_INGESTION_MODE || 'mock') === 'live' &&
  (process.env.NODE_ENV !== 'production' || process.env.YOUTUBE_POLLING_ENABLED === 'true');
export const startYouTubePolling = (): void => {
  if (!isYouTubePollingEnabled() || timer) return;
  const service = new YouTubeIngestionService();
  const configuredInterval = Number(process.env.YOUTUBE_POLL_INTERVAL_MS || 60000);
  const intervalMs = Number.isFinite(configuredInterval)
    ? Math.max(60000, configuredInterval)
    : 60000;
  const run = async () => {
    if (polling) {
      console.warn('YouTube polling cycle skipped because the previous cycle is still running');
      return;
    }
    polling = true;
    try {
      const credentialCount = await service.pollAll();
      console.info('YouTube polling cycle completed', { credentialCount });
    } catch (error) {
      console.error('YouTube polling cycle failed', {
        message: error instanceof Error ? error.message : 'unknown',
      });
    } finally {
      polling = false;
    }
  };
  console.info('YouTube polling started', { intervalMs });
  run();
  timer = setInterval(() => void run(), intervalMs);
  timer.unref();
};
