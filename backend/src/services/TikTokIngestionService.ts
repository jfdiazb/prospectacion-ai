import {
  NormalizedTikTokEvent,
  TikTokOfficialEvent,
  TikTokProvider,
  TikTokProviderError,
} from '../integrations/tiktok';
import Conversation from '../models/Conversation';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import { ConversationService } from './ConversationService';
import { LeadService } from './LeadService';
import { TikTokLaunchAdapter } from './TikTokLaunchAdapter';
import { TikTokOptOutService } from './TikTokOptOutService';

export type TikTokIngestionResult = 'processed' | 'duplicate' | 'not_eligible';
export type TikTokEventOrchestrator = (context: {
  userId: string;
  leadId: string;
  conversationId: string;
  event: NormalizedTikTokEvent;
  isNewLead: boolean;
}) => Promise<void>;

export class TikTokIngestionService {
  constructor(
    private readonly provider = new TikTokProvider(),
    private readonly orchestrator?: TikTokEventOrchestrator,
    private readonly enabled = process.env.TIKTOK_INGESTION_ENABLED === 'true'
  ) {}

  async processOfficialEvent(
    userId: string,
    event: TikTokOfficialEvent
  ): Promise<TikTokIngestionResult> {
    if (!this.enabled)
      throw new TikTokProviderError(
        'Integración pendiente de capacidad/permisos oficiales TikTok.',
        'FEATURE_DISABLED'
      );
    const normalized = this.provider.normalizeEvent(event);
    const hasLaunchMapping = await TikTokLaunchAdapter.hasMappedContent(userId, normalized);
    if (!this.orchestrator && !hasLaunchMapping)
      throw new TikTokProviderError(
        'El transporte/orquestador TikTok oficial aún no está habilitado.',
        'API_UNAVAILABLE'
      );
    const hasInfoKeyword = /\binfo\b/iu.test(normalized.text);
    if (!hasInfoKeyword && !hasLaunchMapping) return 'not_eligible';
    const inbound = await this.claimEvent(userId, normalized);
    if (!inbound) return 'duplicate';

    try {
      let lead: any = await Lead.findOne({
        userId,
        username: normalized.senderId,
        platform: 'tiktok',
      });
      const isNewLead = !lead;
      if (!lead)
        lead = await LeadService.createLead(userId, {
          username: normalized.senderId,
          fullName: normalized.senderDisplayName,
          platform: 'tiktok',
          source: normalized.source,
          profileUrl: normalized.publicUrl,
          status: 'new',
          tags: [hasInfoKeyword ? 'INFO' : 'launch_interaction', 'tiktok'],
        });
      const conversation = await ConversationService.getOrCreateConversation(
        userId,
        lead._id.toString()
      );
      if (!inbound.conversationRecordedAt) {
        await ConversationService.addMessage(conversation._id.toString(), userId, {
          sender: 'lead',
          text: normalized.text,
          platform: 'tiktok',
          direction: 'inbound',
          status: 'received',
          externalMessageId: normalized.externalEventId,
        });
        await InboundEvent.updateOne(
          { _id: inbound._id, userId },
          { conversationRecordedAt: new Date() }
        );
      }
      const explicitOptOut = TikTokOptOutService.matches(normalized.text);
      if (explicitOptOut)
        await TikTokOptOutService.apply(
          userId,
          lead._id.toString(),
          normalized.externalEventId,
          normalized.occurredAt
        );
      let launchProjection: any;
      if (hasLaunchMapping)
        launchProjection = await TikTokLaunchAdapter.ingest(userId, normalized, {
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
        });
      if (!explicitOptOut && !launchProjection)
        await this.orchestrator!({
          userId,
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
          event: normalized,
          isNewLead,
        });
      await InboundEvent.updateOne(
        { _id: inbound._id, userId },
        {
          $set: {
            processingState: 'completed',
            processedAt: new Date(),
            conversationRecordedAt: new Date(),
          },
          $unset: { retryAfter: 1, processingFailedAt: 1 },
        }
      );
      return 'processed';
    } catch (error) {
      const retryDelay = Number(process.env.TIKTOK_EVENT_RETRY_DELAY_MS || 60000);
      await InboundEvent.updateOne(
        { _id: inbound._id, userId },
        {
          $set: {
            processingState: 'failed',
            processingFailedAt: new Date(),
            retryAfter: new Date(
              Date.now() + (Number.isFinite(retryDelay) ? Math.max(60000, retryDelay) : 60000)
            ),
          },
        }
      );
      console.error('TikTok inbound processing failed', {
        eventType: normalized.eventType,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      throw error;
    }
  }

  private async claimEvent(userId: string, event: NormalizedTikTokEvent): Promise<any | null> {
    const now = new Date();
    const existing: any = await InboundEvent.findOne({
      userId,
      externalEventId: event.externalEventId,
    });
    if (existing && existing.processingState !== 'failed') return null;
    if (existing) {
      const retryAt = existing.retryAfter?.getTime?.() || Number.POSITIVE_INFINITY;
      if (retryAt > now.getTime()) return null;
      return InboundEvent.findOneAndUpdate(
        { _id: existing._id, userId, processingState: 'failed' },
        {
          $set: { processingState: 'processing', processingStartedAt: now },
          $inc: { processingAttempts: 1 },
        },
        { new: true }
      );
    }
    try {
      return await InboundEvent.create({
        userId,
        externalEventId: event.externalEventId,
        channel: 'tiktok',
        eventType: event.eventType,
        senderId: event.senderId,
        text: event.text,
        mediaId: event.mediaId,
        matchedKeyword: /\binfo\b/iu.test(event.text) ? 'INFO' : undefined,
        processingState: 'processing',
        processingStartedAt: now,
        processingAttempts: 1,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
    }
    const retry: any = await InboundEvent.findOneAndUpdate(
      {
        userId,
        externalEventId: event.externalEventId,
        processingState: 'failed',
        retryAfter: { $lte: now },
      },
      {
        $set: { processingState: 'processing', processingStartedAt: now },
        $inc: { processingAttempts: 1 },
      },
      { new: true }
    );
    if (!retry) return null;
    if (
      retry.conversationRecordedAt &&
      !(await Conversation.exists({ userId, 'messages.externalMessageId': event.externalEventId }))
    )
      retry.conversationRecordedAt = undefined;
    return retry;
  }
}
