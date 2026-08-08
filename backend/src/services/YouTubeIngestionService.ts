import axios, { type AxiosInstance } from 'axios';
import YouTubeCredential from '../models/YouTubeCredential';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import OutboundMessage from '../models/OutboundMessage';
import { LeadService } from './LeadService';
import { ConversationService } from './ConversationService';
import { AlmaService } from './AlmaService';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';

type TopComment = { id: string; snippet?: { textOriginal?: string; authorDisplayName?: string; authorChannelId?: { value?: string }; videoId?: string; publishedAt?: string } };
type ThreadResponse = { items?: Array<{ snippet?: { topLevelComment?: TopComment } }> };
type CommentListResponse = { items?: TopComment[]; nextPageToken?: string };

export class YouTubeIngestionService {
  constructor(private readonly http: AxiosInstance = axios, private readonly tokens = new YouTubeTokenService(http)) {}

  async pollAll(): Promise<void> {
    const credentials: any[] = await YouTubeCredential.find({});
    for (const credential of credentials) {
      try { await this.pollCredential(credential); } catch (error) { console.error('YouTube polling error', { userId: credential.userId.toString(), message: error instanceof Error ? error.message : 'unknown' }); }
    }
  }

  async pollCredential(credential: any): Promise<void> {
    const token = await this.tokens.getAccessToken(credential.userId.toString());
    const params = new URLSearchParams({ part: 'snippet', allThreadsRelatedToChannelId: credential.channelId, order: 'time', maxResults: '100', textFormat: 'plainText' });
    const response = await this.http.get<ThreadResponse>(`https://www.googleapis.com/youtube/v3/commentThreads?${params}`, { headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000) });
    const cutoff = YouTubeIngestionService.getPollingCutoff(credential);
    const comments = (response.data.items ?? []).map(item => item.snippet?.topLevelComment).filter((item): item is TopComment => Boolean(item));
    comments.sort((a, b) => new Date(a.snippet?.publishedAt ?? 0).getTime() - new Date(b.snippet?.publishedAt ?? 0).getTime());
    for (const comment of comments) if (new Date(comment.snippet?.publishedAt ?? 0).getTime() > cutoff) await this.processComment(credential.userId.toString(), comment, comment.id, credential.channelId);
    if (YouTubeIngestionService.shouldPollReplies(credential)) {
      await this.pollRecentReplies(credential, token);
      credential.lastRepliesPolledAt = new Date();
    }
    credential.lastPolledAt = new Date();
    await credential.save();
  }

  static shouldPollReplies(credential: { lastRepliesPolledAt?: Date }, now = Date.now()): boolean {
    const intervalMs = Math.max(60000, Number(process.env.YOUTUBE_REPLY_POLL_INTERVAL_MS || 120000));
    return !credential.lastRepliesPolledAt || now - credential.lastRepliesPolledAt.getTime() >= intervalMs;
  }

  async pollRecentReplies(credential: any, token: string): Promise<void> {
    const activeDays = Math.max(1, Number(process.env.YOUTUBE_REPLY_ACTIVE_DAYS || 7));
    const maxThreads = Math.max(1, Number(process.env.YOUTUBE_REPLY_MAX_THREADS || 5));
    const recent = await OutboundMessage.find({
      userId: credential.userId,
      channel: 'youtube',
      messageType: 'youtube_reply',
      recipientId: { $exists: true },
      createdAt: { $gte: new Date(Date.now() - activeDays * 24 * 60 * 60 * 1000) },
    }).sort({ createdAt: -1 }).limit(maxThreads * 3).select('recipientId').lean();
    const threadIds = [...new Set(recent.map((item: any) => item.recipientId).filter(Boolean))].slice(0, maxThreads);
    for (const threadId of threadIds) await this.pollThreadReplies(credential, token, threadId);
  }

  async pollThreadReplies(credential: any, token: string, threadId: string): Promise<void> {
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({ part: 'snippet', parentId: threadId, maxResults: '100', textFormat: 'plainText' });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await this.http.get<CommentListResponse>(`https://www.googleapis.com/youtube/v3/comments?${params}`, {
        headers: { Authorization: `Bearer ${token}` }, timeout: Number(process.env.YOUTUBE_TIMEOUT_MS || 10000),
      });
      const replies = response.data.items ?? [];
      replies.sort((a, b) => new Date(a.snippet?.publishedAt ?? 0).getTime() - new Date(b.snippet?.publishedAt ?? 0).getTime());
      for (const reply of replies) await this.processComment(credential.userId.toString(), reply, threadId, credential.channelId);
      pageToken = response.data.nextPageToken;
    } while (pageToken);
  }

  static getPollingCutoff(credential: { connectedAt?: Date; lastPolledAt?: Date }): number {
    const connectedAt = credential.connectedAt?.getTime() ?? 0;
    const lastPolledAt = credential.lastPolledAt?.getTime();
    if (!lastPolledAt) return connectedAt;
    const overlapMs = Math.max(0, Number(process.env.YOUTUBE_POLL_OVERLAP_MS || 60 * 60 * 1000));
    return Math.max(connectedAt, lastPolledAt - overlapMs);
  }

  async processComment(userId: string, comment: TopComment, responseParentId = comment.id, ownChannelId?: string): Promise<void> {
    const text = comment.snippet?.textOriginal?.trim();
    const senderId = comment.snippet?.authorChannelId?.value;
    if (!text || !senderId || !comment.id) return;
    if (ownChannelId && senderId === ownChannelId) return;
    const hasInfoKeyword = /(^|\s)info(\s|$)/i.test(text);
    const existingLead = await Lead.findOne({ userId, username: senderId, platform: 'youtube' });
    if (!existingLead && !hasInfoKeyword) return;
    const claimed: any = await InboundEvent.findOneAndUpdate({ externalEventId: `youtube:${comment.id}` }, { $setOnInsert: {
      userId, externalEventId: `youtube:${comment.id}`, channel: 'youtube', eventType: 'comment', senderId, text, mediaId: comment.snippet?.videoId, matchedKeyword: hasInfoKeyword ? 'INFO' : undefined,
    } }, { upsert: true, new: true, includeResultMetadata: true });
    if (claimed.lastErrorObject?.updatedExisting || !claimed.value) return;
    let lead = existingLead;
    const isNewLead = !lead;
    if (!lead) {
      const created = await LeadService.createLead(userId, { username: senderId, fullName: comment.snippet?.authorDisplayName, platform: 'youtube', source: 'youtube_info', status: 'new', tags: ['INFO'] });
      lead = await Lead.findById(created._id);
    }
    if (!lead) throw new Error('No fue posible crear el lead de YouTube');
    const conversation = await ConversationService.getOrCreateConversation(userId, lead._id.toString());
    await ConversationService.addMessage(conversation._id.toString(), userId, { sender: 'lead', text, platform: 'youtube' });
    await AlmaService.processMessage({ userId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), text, isNewLead, platform: 'youtube', sourceEventId: `youtube:${comment.id}`, recipient: { type: 'youtube_comment', parentCommentId: responseParentId } });
  }
}

let timer: NodeJS.Timeout | undefined;
export const startYouTubePolling = (): void => {
  if ((process.env.YOUTUBE_INGESTION_MODE || 'mock') !== 'live' || timer) return;
  const service = new YouTubeIngestionService();
  const run = () => void service.pollAll();
  run();
  timer = setInterval(run, Number(process.env.YOUTUBE_POLL_INTERVAL_MS || 60000));
  timer.unref();
};
