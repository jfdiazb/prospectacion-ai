import crypto from 'crypto';
import type { Request, Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { WhatsAppAssistedService } from '../services/WhatsAppAssistedService';
import { AutomationEngineService } from '../services/AutomationEngineService';
import { AlmaService } from '../services/AlmaService';
import Lead from '../models/Lead';
import InboundEvent from '../models/InboundEvent';
import { WhatsAppInboundNormalizer } from '../services/WhatsAppInboundNormalizer';
import { WhatsAppLaunchAdapter } from '../services/WhatsAppLaunchAdapter';
import { WhatsAppOptOutService } from '../services/WhatsAppOptOutService';
import { WhatsAppInboundDiagnosticsService } from '../services/WhatsAppInboundDiagnosticsService';

export class WhatsAppController {
  static async inboundDiagnostics(req: AuthRequest, res: Response) {
    const from = new Date(String(req.query.from || ''));
    const to = new Date(String(req.query.to || ''));
    const textSha256 = String(req.query.textSha256 || '').toLowerCase();
    const duration = to.getTime() - from.getTime();
    if (!Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || duration < 0 || duration > 15 * 60 * 1000 || !/^[a-f0-9]{64}$/.test(textSha256))
      return res.status(400).json({ success: false, message: 'Consulta de diagnóstico inválida' });
    const data = await WhatsAppInboundDiagnosticsService.inspect(req.userId!, { from, to, textSha256 });
    return res.json({ success: true, data });
  }

  private static normalizePhone(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
  }

  private static isValidSignature(rawBody: Buffer, signature?: string): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret || !signature) return false;
    const expected = Buffer.from(
      `sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`
    );
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  static verifyWebhook(req: Request, res: Response) {
    if (
      req.query['hub.mode'] === 'subscribe' &&
      req.query['hub.verify_token'] === process.env.VERIFY_TOKEN
    )
      return res.status(200).send(req.query['hub.challenge']);
    return res.sendStatus(403);
  }

  static async receiveMessage(req: Request, res: Response) {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      const signature = req.header('x-hub-signature-256');
      if (!WhatsAppController.isValidSignature(rawBody, signature)) {
        console.warn('WhatsApp webhook signature rejected', {
          hasAppSecret: Boolean(process.env.WHATSAPP_APP_SECRET),
          hasSignature: Boolean(signature),
          contentLength: rawBody.length,
        });
        return res.sendStatus(401);
      }
      const payload = JSON.parse(rawBody.toString('utf8'));
      const deliveries = (Array.isArray(payload?.entry) ? payload.entry : []).flatMap(
        (entry: any) =>
          (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change: any) => {
            const value = change?.value;
            return (Array.isArray(value?.messages) ? value.messages : []).map((message: any) => ({
              message,
              metadata: value?.metadata,
            }));
          })
      );
      if (!deliveries.length) {
        console.info('WhatsApp webhook ignored', { reason: 'no_messages' });
        return res.sendStatus(200);
      }
      res.sendStatus(200);
      await Promise.all(
        deliveries.map((delivery: { message: any; metadata: any }) =>
          WhatsAppController.processMessage(delivery.message, delivery.metadata).catch(error => {
            console.error('WhatsApp asynchronous processing failed', {
              errorType: error instanceof Error ? error.name : 'unknown',
            });
          })
        )
      );
      return;
    } catch (error) {
      console.error('WhatsApp webhook processing failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      });
      return res.sendStatus(500);
    }
  }

  private static async processMessage(message: any, metadata: any): Promise<void> {
    const normalized = WhatsAppInboundNormalizer.normalize(message, metadata);
    if (!normalized) {
      console.info('WhatsApp webhook ignored', {
        hasMessage: Boolean(message),
        messageType: typeof message?.type === 'string' ? message.type : 'unknown',
        hasSender: Boolean(message?.from),
        hasText: Boolean(message?.text?.body || message?.interactive),
        hasEventId: Boolean(message?.id),
      });
      return;
    }
    const from = normalized.waId;
    const text = normalized.text;
    const eventId = normalized.externalEventId;
    const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
    if (!configuredPhoneNumberId || normalized.phoneNumberId !== configuredPhoneNumberId) {
      console.warn('WhatsApp webhook message ignored', { reason: 'phone_number_id_mismatch' });
      return;
    }
    const senderPhone = WhatsAppController.normalizePhone(from);
    const businessPhone = WhatsAppController.normalizePhone(normalized.displayPhoneNumber);
    if (!senderPhone || (businessPhone && senderPhone === businessPhone)) {
      console.warn('WhatsApp webhook message ignored', { reason: 'invalid_or_own_sender' });
      return;
    }
    const timestampMs = normalized.occurredAt.getTime();
    const maxAgeMs = Number(process.env.WHATSAPP_INBOUND_MAX_AGE_MS || 600000);
    if (
      !Number.isFinite(timestampMs) ||
      timestampMs <= 0 ||
      Date.now() - timestampMs > maxAgeMs ||
      timestampMs > Date.now() + 60000
    ) {
      console.warn('WhatsApp webhook message ignored', { reason: 'invalid_or_stale_timestamp' });
      return;
    }
    const allowlist = (process.env.WHATSAPP_ACTIVATION_ALLOWLIST || '')
      .split(',')
      .map(WhatsAppController.normalizePhone)
      .filter(Boolean);
    if (allowlist.length && !allowlist.includes(senderPhone)) {
      console.info('WhatsApp webhook message ignored', { reason: 'sender_not_allowlisted' });
      return;
    }
    console.info('WhatsApp webhook message accepted', {
      messageType: normalized.messageType,
      autoReplyEnabled: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true',
    });
    const userId = process.env.CRM_OWNER_ID;
    if (!userId) throw new Error('CRM_OWNER_ID no configurado');

    const now = new Date();
    let inbound: any = await InboundEvent.findOne({ userId, externalEventId: eventId });
    if (inbound) {
      const staleProcessing =
        inbound.processingState === 'processing' &&
        now.getTime() - new Date(inbound.processingStartedAt || inbound.updatedAt).getTime() >=
          60000;
      const retryableFailure =
        inbound.processingState === 'failed' &&
        (!inbound.retryAfter || new Date(inbound.retryAfter) <= now);
      if (!staleProcessing && !retryableFailure) {
        if (inbound.processingState === 'failed' || inbound.processingState === 'processing')
          throw new Error('WhatsApp event is waiting for safe retry');
        console.info('WhatsApp webhook duplicate ignored');
        return;
      }
      inbound.processingState = 'processing';
      inbound.processingStartedAt = now;
      inbound.processingAttempts = Number(inbound.processingAttempts || 0) + 1;
      inbound.retryAfter = undefined;
      await inbound.save();
    } else {
      try {
        inbound = await InboundEvent.create({
          userId,
          externalEventId: eventId,
          channel: 'whatsapp',
          eventType: normalized.messageType,
          senderId: senderPhone,
          text,
          accountId: normalized.phoneNumberId,
          messageId: eventId,
          eventTimestamp: normalized.occurredAt,
          rawPayload: {
            messageType: normalized.messageType,
            contextMessageId: normalized.contextMessageId,
            media: normalized.media
              ? {
                  type: normalized.media.type,
                  id: normalized.media.id,
                  mimeType: normalized.media.mimeType,
                  sha256: normalized.media.sha256,
                }
              : undefined,
            hasLaunchControl: Boolean(normalized.action),
          },
          processingState: 'processing',
          processingStartedAt: now,
          processingAttempts: 1,
        });
      } catch (error: any) {
        if (error?.code === 11000) {
          console.info('WhatsApp webhook duplicate ignored');
          return;
        }
        throw error;
      }
    }

    try {
      let lead: any = await Lead.findOne({ phone: senderPhone, userId });
      const isNewLead = !lead;
      if (!lead) {
        const created = await LeadService.createLead(userId, {
          username: senderPhone,
          phone: senderPhone,
          platform: 'whatsapp',
          source: 'whatsapp_webhook',
          status: 'new',
          tags: [],
        });
        lead = await Lead.findById(created._id);
      }
      if (!lead) throw new Error('No fue posible crear el lead de WhatsApp');
      const conversation = await ConversationService.getOrCreateConversation(
        userId,
        lead._id.toString()
      );
      if (!inbound.conversationRecordedAt) {
        await ConversationService.addMessage(conversation._id.toString(), userId, {
          sender: 'lead',
          text,
          platform: 'whatsapp',
          direction: 'inbound',
          status: 'received',
          externalMessageId: eventId,
        });
        inbound.conversationRecordedAt = new Date();
        await inbound.save();
      }

      const explicitOptOut = WhatsAppOptOutService.matches(text);
      if (explicitOptOut)
        await WhatsAppOptOutService.apply(
          userId,
          lead._id.toString(),
          eventId,
          normalized.occurredAt
        );
      try {
        await WhatsAppLaunchAdapter.ingest(userId, normalized, {
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
        });
      } catch (launchError) {
        console.warn('WhatsApp launch adaptation failed', {
          messageId: eventId,
          phoneNumberId: normalized.phoneNumberId,
          messageType: normalized.messageType,
          errorType: launchError instanceof Error ? launchError.name : 'unknown',
        });
      }

      if (explicitOptOut) {
        await InboundEvent.updateOne(
          { _id: inbound._id },
          { $set: { processingState: 'completed', processedAt: new Date() } }
        );
        console.info('WhatsApp explicit opt-out processed', {
          messageType: normalized.messageType,
        });
        return;
      }

      const automaticEnabled =
        process.env.WHATSAPP_REPLY_MODE === 'automatic' &&
        process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true';
      if (automaticEnabled)
        await AlmaService.processMessage({
          userId,
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
          text,
          isNewLead,
          platform: 'whatsapp',
          sourceEventId: eventId,
          recipient: { type: 'whatsapp_user', phoneNumber: senderPhone },
        });
      else
        await WhatsAppAssistedService.process({
          userId,
          leadId: lead._id.toString(),
          conversationId: conversation._id.toString(),
          text,
          isNewLead,
          sourceEventId: eventId,
        });
      const refreshed: any = await Lead.findOne({ _id: lead._id, userId }).lean();
      await AutomationEngineService.emitMessageEvents({
        eventId,
        userId,
        leadId: lead._id.toString(),
        conversationId: conversation._id.toString(),
        platform: 'whatsapp',
        source: 'whatsapp_webhook',
        text,
        recipient: { type: 'whatsapp_user', externalId: senderPhone },
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
        { _id: inbound._id },
        { $set: { processingState: 'completed', processedAt: new Date() } }
      );
      console.info('WhatsApp webhook processing completed', { isNewLead });
    } catch (error) {
      await InboundEvent.updateOne(
        { _id: inbound._id },
        {
          $set: {
            processingState: 'failed',
            processingFailedAt: new Date(),
            retryAfter: new Date(Date.now() + 60000),
          },
        }
      );
      throw error;
    }
  }
}
