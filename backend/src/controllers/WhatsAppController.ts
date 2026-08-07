import crypto from 'crypto';
import type { Request, Response } from 'express';
import { GeminiService } from '../services/GeminiService';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { MessagingService } from '../services/MessagingService';
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
      if (!WhatsAppController.isValidSignature(rawBody, req.header('x-hub-signature-256'))) return res.sendStatus(401);
      const payload = JSON.parse(rawBody.toString('utf8'));
      const message = payload?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
      const from = message?.from;
      const text = message?.text?.body;
      const eventId = message?.id;
      if (!from || !text || !eventId) return res.sendStatus(200);
      const userId = process.env.CRM_OWNER_ID;
      if (!userId) throw new Error('CRM_OWNER_ID no configurado');

      const claimed = await InboundEvent.findOneAndUpdate(
        { externalEventId: eventId },
        { $setOnInsert: { userId, externalEventId: eventId, channel: 'whatsapp', eventType: 'message', senderId: from, text } },
        { upsert: true, new: true, includeResultMetadata: true },
      );
      if (claimed.lastErrorObject?.updatedExisting) return res.sendStatus(200);

      let lead = await Lead.findOne({ phone: from, userId });
      if (!lead) {
        const created = await LeadService.createLead(userId, { username: from, phone: from, platform: 'whatsapp', source: 'whatsapp_webhook', status: 'new', tags: [] });
        lead = await Lead.findById(created._id);
      }
      if (!lead) throw new Error('No fue posible crear el lead de WhatsApp');
      const conversation = await ConversationService.getOrCreateConversation(userId, lead._id.toString());
      await ConversationService.addMessage(conversation._id.toString(), userId, { sender: 'lead', text, platform: 'whatsapp' });
      if (process.env.WHATSAPP_AUTO_REPLY_ENABLED !== 'true') return res.sendStatus(200);

      const aiResponse = await GeminiService.generateResponse(`Eres ALMA, asistente comercial breve y natural. Mensaje: ${text}`);
      await ConversationService.addMessage(conversation._id.toString(), userId, { sender: 'ai', text: aiResponse, platform: 'whatsapp' });
      await MessagingService.send({ userId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: eventId,
        text: aiResponse, recipient: { type: 'whatsapp_user', phoneNumber: from } });
      return res.sendStatus(200);
    } catch (error) {
      console.error('WhatsApp webhook error:', error);
      return res.sendStatus(500);
    }
  }
}
