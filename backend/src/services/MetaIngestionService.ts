import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import { LeadService } from './LeadService';
import { ConversationService } from './ConversationService';
import { AssistedResponseService } from './AssistedResponseService';
import { MetaWebhookNormalizer, type NormalizedMetaEvent } from '../integrations/meta';
import { AutomationEngineService } from './AutomationEngineService';
import { CommercialContextService } from './CommercialContextService';
import { MetaLaunchAdapter } from './MetaLaunchAdapter';

export class MetaIngestionService {
  static async acceptPayload(
    userId: string,
    payload: unknown
  ): Promise<Array<{ id: string; event: NormalizedMetaEvent }>> {
    const accepted: Array<{ id: string; event: NormalizedMetaEvent }> = [];
    const commercialContext: any = await CommercialContextService.getActive(userId);
    for (const event of MetaWebhookNormalizer.normalizePayload(payload)) {
      const configuredMaxAge = Number(process.env.META_INBOUND_MAX_AGE_MS || 600000);
      const maxAgeMs = Number.isFinite(configuredMaxAge)
        ? Math.max(60000, configuredMaxAge)
        : 600000;
      if (
        !Number.isFinite(event.occurredAt.getTime()) ||
        Date.now() - event.occurredAt.getTime() > maxAgeMs ||
        event.occurredAt.getTime() > Date.now() + 60000
      )
        continue;
      const duplicate: any = await InboundEvent.findOne({
        userId,
        externalEventId: event.externalEventId,
      }).select('processingState retryAfter processingStartedAt');
      const now = new Date();
      const recoverable =
        duplicate &&
        ((duplicate.processingState === 'failed' &&
          duplicate.retryAfter &&
          duplicate.retryAfter <= now) ||
          (duplicate.processingState === 'processing' &&
            duplicate.processingStartedAt &&
            duplicate.processingStartedAt <= new Date(now.getTime() - 5 * 60 * 1000)));
      if (duplicate && !recoverable) continue;
      if (recoverable) {
        const reclaimed: any = await InboundEvent.findOneAndUpdate(
          { _id: duplicate._id },
          {
            $set: { processingState: 'processing', processingStartedAt: now },
            $inc: { processingAttempts: 1 },
          },
          { new: true }
        );
        accepted.push({ id: reclaimed._id.toString(), event });
        continue;
      }
      const existingLead = await Lead.exists({
        userId,
        username: event.externalUserId,
        platform: event.platform,
      });
      if (
        event.eventType === 'comment' &&
        !existingLead &&
        !MetaWebhookNormalizer.matchesInitialIntent(event.content, commercialContext) &&
        !(await MetaLaunchAdapter.hasMappedContent(userId, event))
      )
        continue;
      try {
        const inbound: any = await InboundEvent.create({
          userId,
          externalEventId: event.externalEventId,
          channel: event.platform,
          eventType: event.eventType,
          senderId: event.externalUserId,
          text: event.content,
          mediaId: event.externalContentId,
          recipientId: event.recipientId,
          messageId: event.messageId,
          commentId: event.commentId,
          parentId: event.parentId,
          accountId: event.accountId,
          eventTimestamp: event.occurredAt,
          rawPayload: event.rawPayload,
          matchedKeyword: MetaWebhookNormalizer.matchesInitialIntent(
            event.content,
            commercialContext
          )
            ? 'initial_interest'
            : undefined,
          processingState: 'processing',
          processingStartedAt: new Date(),
          processingAttempts: 1,
          processedAt: event.occurredAt,
        });
        accepted.push({ id: inbound._id.toString(), event });
      } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const now = new Date();
        const reclaimed: any = await InboundEvent.findOneAndUpdate(
          {
            userId,
            externalEventId: event.externalEventId,
            $or: [
              { processingState: 'failed', retryAfter: { $lte: now } },
              {
                processingState: 'processing',
                processingStartedAt: { $lte: new Date(now.getTime() - 5 * 60 * 1000) },
              },
            ],
          },
          {
            $set: { processingState: 'processing', processingStartedAt: now },
            $inc: { processingAttempts: 1 },
          },
          { new: true }
        );
        if (reclaimed) accepted.push({ id: reclaimed._id.toString(), event });
      }
    }
    return accepted;
  }

  static async processAccepted(
    userId: string,
    accepted: { id: string; event: NormalizedMetaEvent }
  ): Promise<void> {
    const { id, event } = accepted;
    let conversationId: string | undefined;
    try {
      let lead: any = await Lead.findOne({
        userId,
        username: event.externalUserId,
        platform: event.platform,
      });
      const isNewLead = !lead;
      if (!lead) {
        const created: any = await LeadService.createLead(userId, {
          username: event.externalUserId,
          platform: event.platform,
          source: event.source,
          currentChannel: event.platform,
          profileUrl: event.publicUrl,
          status: 'new',
          tags: ['initial_interest', event.platform],
          origin: {
            platform: event.platform,
            source: event.source,
            externalContentId: event.externalContentId,
            initialContent: event.content.slice(0, 1000),
            occurredAt: event.occurredAt,
            publicUrl: event.publicUrl,
          },
        } as any);
        lead = await Lead.findById(created._id);
      } else {
        await Lead.updateOne(
          { _id: lead._id, userId },
          { $set: { currentChannel: event.platform } }
        );
      }
      if (!lead) throw new Error('No fue posible crear el lead Meta');
      const conversation = await ConversationService.getOrCreateConversation(
        userId,
        lead._id.toString()
      );
      const currentConversationId = conversation._id.toString();
      conversationId = currentConversationId;
      const inbound: any = await InboundEvent.findOne({ _id: id, userId })
        .select('conversationRecordedAt')
        .lean();
      if (!inbound?.conversationRecordedAt) {
        await ConversationService.addMessage(currentConversationId, userId, {
          sender: 'lead',
          text: event.content,
          platform: event.platform,
          direction: 'inbound',
          status: 'received',
          externalMessageId: event.externalEventId,
        });
        await InboundEvent.updateOne(
          { _id: id, userId },
          { $set: { conversationRecordedAt: new Date() } }
        );
      }
      try {
        await MetaLaunchAdapter.ingest(userId, event, {
          leadId: lead._id.toString(),
          conversationId: currentConversationId,
        });
      } catch (launchError) {
        console.warn('Meta launch adaptation failed', {
          platform: event.platform,
          eventType: event.eventType,
          externalEventId: event.externalEventId,
          errorType: launchError instanceof Error ? launchError.name : 'unknown',
        });
      }
      await AssistedResponseService.process({
        userId,
        leadId: lead._id.toString(),
        conversationId: currentConversationId,
        sourceEventId: event.externalEventId,
        text: event.content,
        isNewLead,
        platform: event.platform,
        recipient: event.recipient,
      });
      const recipient =
        event.recipient.type === 'instagram_user'
          ? { type: event.recipient.type, externalId: event.recipient.instagramScopedId }
          : event.recipient.type === 'facebook_user'
            ? { type: event.recipient.type, externalId: event.recipient.pageScopedId }
            : 'commentId' in event.recipient
              ? {
                  type:
                    event.recipient.type === 'comment' ? 'instagram_comment' : event.recipient.type,
                  externalId: event.recipient.commentId,
                }
              : undefined;
      const refreshed: any = await Lead.findOne({ _id: lead._id, userId }).lean();
      await AutomationEngineService.emitMessageEvents({
        eventId: event.externalEventId,
        userId,
        leadId: lead._id.toString(),
        conversationId: currentConversationId,
        platform: event.platform,
        source: event.source,
        text: event.content,
        occurredAt: event.occurredAt.toISOString(),
        recipient,
        data: {
          score: refreshed?.score,
          interestLevel: refreshed?.interestLevel,
          status: refreshed?.status,
          tags: refreshed?.tags,
          intent: refreshed?.qualification?.intent,
          normalizedIntent: refreshed?.normalizedIntent,
          normalizedIntents: refreshed?.normalizedIntents,
          meetingIntent: refreshed?.qualification?.meetingIntent,
          commercialContextId: refreshed?.commercialContextId?.toString(),
        },
      });
      await InboundEvent.updateOne(
        { _id: id, userId },
        { $set: { processingState: 'completed', processedAt: new Date() } }
      );
    } catch (error) {
      await InboundEvent.updateOne(
        { _id: id, userId },
        {
          $set: {
            processingState: 'failed',
            processingFailedAt: new Date(),
            retryAfter: new Date(Date.now() + 60000),
          },
        }
      );
      if (conversationId)
        await Conversation.updateOne(
          { _id: conversationId, userId, 'messages.externalMessageId': event.externalEventId },
          {
            $set: {
              'messages.$.status': 'failed',
              'messages.$.processingError': 'No fue posible generar la propuesta asistida',
            },
          }
        );
      console.error('Meta asynchronous event processing failed', {
        platform: event.platform,
        eventType: event.eventType,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
}
