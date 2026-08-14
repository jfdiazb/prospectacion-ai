import crypto from 'crypto';
import type { Request, Response } from 'express';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { AlmaService } from '../services/AlmaService';
import { AutomationService } from '../services/AutomationService';
import Lead from '../models/Lead';
import InboundEvent from '../models/InboundEvent';

export class WhatsAppController {
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
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
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
        return res.sendStatus(200);
      }
      console.info('WhatsApp webhook message accepted', {
        messageType: typeof message?.type === 'string' ? message.type : 'unknown',
        autoReplyEnabled: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true',
      });
      const userId = process.env.CRM_OWNER_ID;
      if (!userId) throw new Error('CRM_OWNER_ID no configurado');

      const claimed: any = await InboundEvent.findOneAndUpdate(
        { externalEventId: eventId },
        { $setOnInsert: { userId, externalEventId: eventId, channel: 'whatsapp', eventType: 'message', senderId: from, text, processingState: 'processing', processingStartedAt: new Date(), processingAttempts: 1 } },
        { upsert: true, new: true, includeResultMetadata: true },
      );
      if (claimed.lastErrorObject?.updatedExisting) {
        console.info('WhatsApp webhook duplicate ignored');
        return res.sendStatus(200);
      }

      let lead: any = await Lead.findOne({ phone: from, userId });
      const isNewLead = !lead;
      if (!lead) {
        const created = await LeadService.createLead(userId, { username: from, phone: from, platform: 'whatsapp', source: 'whatsapp_webhook', status: 'new', tags: [] });
        lead = await Lead.findById(created._id);
      }
      if (!lead) throw new Error('No fue posible crear el lead de WhatsApp');
      const conversation = await ConversationService.getOrCreateConversation(userId, lead._id.toString());
      await ConversationService.addMessage(conversation._id.toString(), userId, { sender: 'lead', text, platform: 'whatsapp' });

      if (process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true') {
        const automation = await AutomationService.findMatchingKeywordFlow(userId, text);
        const automationReply = AutomationService.getReply(automation);
        await AlmaService.processMessage({
          userId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), text, isNewLead,
          platform: 'whatsapp', sourceEventId: eventId, recipient: { type: 'whatsapp_user', phoneNumber: from },
          automation: automation && automationReply ? { flowId: automation._id.toString(), response: automationReply } : undefined,
        });
      }
      await InboundEvent.updateOne({ _id: claimed.value._id }, { $set: { processingState: 'completed', processedAt: new Date() } });
      console.info('WhatsApp webhook processing completed', { isNewLead });
      return res.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      return res.sendStatus(500);
    }
  }
}
