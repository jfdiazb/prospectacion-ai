import crypto from 'crypto';
import type { Request, Response } from 'express';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { AlmaService } from '../services/AlmaService';
import { AutomationService } from '../services/AutomationService';
import Lead from '../models/Lead';
import InboundEvent from '../models/InboundEvent';

export class WhatsAppController {
  private static normalizePhone(value: unknown): string {
    return typeof value === 'string' ? value.replace(/\D/g, '') : '';
  }

  private static isValidSignature(rawBody: Buffer, signature?: string): boolean {
    const appSecret = process.env.WHATSAPP_APP_SECRET;
    if (!appSecret || !signature) return false;
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex')}`);
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  static verifyWebhook(req: Request, res: Response) {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.VERIFY_TOKEN) return res.status(200).send(req.query['hub.challenge']);
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
      const deliveries = (Array.isArray(payload?.entry) ? payload.entry : []).flatMap((entry: any) =>
        (Array.isArray(entry?.changes) ? entry.changes : []).flatMap((change: any) => {
          const value = change?.value;
          return (Array.isArray(value?.messages) ? value.messages : []).map((message: any) => ({ message, metadata: value?.metadata }));
        }));
      if (!deliveries.length) {
        console.info('WhatsApp webhook ignored', { reason: 'no_messages' });
        return res.sendStatus(200);
      }
      for (const delivery of deliveries) await WhatsAppController.processMessage(delivery.message, delivery.metadata);
      return res.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp webhook processing failed', { errorType: error instanceof Error ? error.name : 'unknown' });
      return res.sendStatus(500);
    }
  }

  private static async processMessage(message: any, metadata: any): Promise<void> {
      const from = message?.from;
      const text = message?.text?.body?.trim();
      const eventId = message?.id;
      if (!from || !text || !eventId) {
        console.info('WhatsApp webhook ignored', {
          hasMessage: Boolean(message),
          messageType: typeof message?.type === 'string' ? message.type : 'unknown',
          hasSender: Boolean(from),
          hasText: Boolean(text),
          hasEventId: Boolean(eventId),
        });
        return;
      }
      const configuredPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      if (!configuredPhoneNumberId || metadata?.phone_number_id !== configuredPhoneNumberId) {
        console.warn('WhatsApp webhook message ignored', { reason: 'phone_number_id_mismatch' });
        return;
      }
      const senderPhone = WhatsAppController.normalizePhone(from);
      const businessPhone = WhatsAppController.normalizePhone(metadata?.display_phone_number);
      if (!senderPhone || (businessPhone && senderPhone === businessPhone)) {
        console.warn('WhatsApp webhook message ignored', { reason: 'invalid_or_own_sender' });
        return;
      }
      const timestampMs = Number(message?.timestamp) * 1000;
      const maxAgeMs = Number(process.env.WHATSAPP_INBOUND_MAX_AGE_MS || 600000);
      if (!Number.isFinite(timestampMs) || timestampMs <= 0 || Date.now() - timestampMs > maxAgeMs || timestampMs > Date.now() + 60000) {
        console.warn('WhatsApp webhook message ignored', { reason: 'invalid_or_stale_timestamp' });
        return;
      }
      const allowlist = (process.env.WHATSAPP_ACTIVATION_ALLOWLIST || '').split(',').map(WhatsAppController.normalizePhone).filter(Boolean);
      if (allowlist.length && !allowlist.includes(senderPhone)) {
        console.info('WhatsApp webhook message ignored', { reason: 'sender_not_allowlisted' });
        return;
      }
      console.info('WhatsApp webhook message accepted', {
        messageType: typeof message?.type === 'string' ? message.type : 'unknown',
        autoReplyEnabled: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true',
      });
      const userId = process.env.CRM_OWNER_ID;
      if (!userId) throw new Error('CRM_OWNER_ID no configurado');

      const now = new Date();
      let inbound: any = await InboundEvent.findOne({ externalEventId: eventId });
      if (inbound) {
        const staleProcessing = inbound.processingState === 'processing' && now.getTime() - new Date(inbound.processingStartedAt || inbound.updatedAt).getTime() >= 60000;
        const retryableFailure = inbound.processingState === 'failed' && (!inbound.retryAfter || new Date(inbound.retryAfter) <= now);
        if (!staleProcessing && !retryableFailure) {
          if (inbound.processingState === 'failed' || inbound.processingState === 'processing') throw new Error('WhatsApp event is waiting for safe retry');
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
          inbound = await InboundEvent.create({ userId, externalEventId: eventId, channel: 'whatsapp', eventType: 'message', senderId: senderPhone, text, processingState: 'processing', processingStartedAt: now, processingAttempts: 1 });
        } catch (error: any) {
          if (error?.code === 11000) { console.info('WhatsApp webhook duplicate ignored'); return; }
          throw error;
        }
      }

      try {
        let lead: any = await Lead.findOne({ phone: senderPhone, userId });
        const isNewLead = !lead;
        if (!lead) {
          const created = await LeadService.createLead(userId, { username: senderPhone, phone: senderPhone, platform: 'whatsapp', source: 'whatsapp_webhook', status: 'new', tags: [] });
          lead = await Lead.findById(created._id);
        }
        if (!lead) throw new Error('No fue posible crear el lead de WhatsApp');
        const conversation = await ConversationService.getOrCreateConversation(userId, lead._id.toString());
        if (!inbound.conversationRecordedAt) {
          await ConversationService.addMessage(conversation._id.toString(), userId, { sender: 'lead', text, platform: 'whatsapp' });
          inbound.conversationRecordedAt = new Date();
          await inbound.save();
        }

        if (process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true') {
          const automation = await AutomationService.findMatchingKeywordFlow(userId, text);
          const automationReply = AutomationService.getReply(automation);
          await AlmaService.processMessage({
            userId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), text, isNewLead,
            platform: 'whatsapp', sourceEventId: eventId, recipient: { type: 'whatsapp_user', phoneNumber: senderPhone },
            automation: automation && automationReply ? { flowId: automation._id.toString(), response: automationReply } : undefined,
          });
        }
        await InboundEvent.updateOne({ _id: inbound._id }, { $set: { processingState: 'completed', processedAt: new Date() } });
        console.info('WhatsApp webhook processing completed', { isNewLead });
      } catch (error) {
        await InboundEvent.updateOne({ _id: inbound._id }, { $set: { processingState: 'failed', processingFailedAt: new Date(), retryAfter: new Date(Date.now() + 60000) } });
        throw error;
      }
  }
}
