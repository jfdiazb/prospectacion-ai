import axios, { type AxiosInstance } from 'axios';
import YouTubeCredential from '../models/YouTubeCredential';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import { LeadService } from './LeadService';
import { ConversationService } from './ConversationService';
import { AlmaService } from './AlmaService';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';

type TopComment = { id: string; snippet?: { textOriginal?: string; authorDisplayName?: string; authorChannelId?: { value?: string }; videoId?: string; publishedAt?: string } };
type ThreadResponse = { items?: Array<{ snippet?: { topLevelComment?: TopComment } }> };

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
    const cutoff = credential.lastPolledAt?.getTime() ?? 0;
    const comments = (response.data.items ?? []).map(item => item.snippet?.topLevelComment).filter((item): item is TopComment => Boolean(item));
    comments.sort((a, b) => new Date(a.snippet?.publishedAt ?? 0).getTime() - new Date(b.snippet?.publishedAt ?? 0).getTime());
    for (const comment of comments) if (new Date(comment.snippet?.publishedAt ?? 0).getTime() > cutoff) await this.processComment(credential.userId.toString(), comment);
    credential.lastPolledAt = new Date();
    await credential.save();
  }

  async processComment(userId: string, comment: TopComment): Promise<void> {
    const text = comment.snippet?.textOriginal?.trim();
    const senderId = comment.snippet?.authorChannelId?.value;
    if (!text || !senderId || !comment.id) return;
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
    await AlmaService.processMessage({ userId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), text, isNewLead, platform: 'youtube', sourceEventId: `youtube:${comment.id}`, recipient: { type: 'youtube_comment', parentCommentId: comment.id } });
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
