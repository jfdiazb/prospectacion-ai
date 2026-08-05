import crypto from 'crypto';
import type { Request, Response } from 'express';
import Lead from '../models/Lead';
import InboundEvent from '../models/InboundEvent';
import { LeadService } from '../services/LeadService';
import { ConversationService } from '../services/ConversationService';
import { AlmaService } from '../services/AlmaService';

export class MetaController {
  private static validSignature(rawBody: Buffer, signature?: string): boolean {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !signature) return false;
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private static isMockRequest(req: Request): boolean {
    return process.env.NODE_ENV !== 'production'
      && process.env.META_MOCK_MODE === 'true'
      && req.header('x-alma-mock-event') === 'true';
  }

  static verify(req: Request, res: Response) {
    if (!process.env.META_VERIFY_TOKEN) return res.status(503).json({ success: false, message: 'META_VERIFY_TOKEN no configurado' });
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  }

  static async receive(req: Request, res: Response) {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      const mockRequest = MetaController.isMockRequest(req);
      if (!mockRequest && !process.env.META_APP_SECRET) return res.status(503).json({ success: false, message: 'META_APP_SECRET no configurado' });
      if (!mockRequest && !MetaController.validSignature(rawBody, req.header('x-hub-signature-256'))) return res.status(401).json({ success: false, message: 'Firma de Meta inválida' });
      const payload = JSON.parse(rawBody.toString('utf8'));
      const ownerId = process.env.CRM_OWNER_ID;
      if (!ownerId) throw new Error('CRM_OWNER_ID no configurado');

      for (const entry of payload.entry ?? []) {
        for (const change of entry.changes ?? []) {
          const value = change.value ?? {};
          const text = value.text ?? value.message?.text;
          const senderId = value.from?.id ?? value.sender?.id;
          const eventId = value.id ?? value.comment_id ?? value.message?.mid;
          if (!text || !senderId || !eventId) continue;
          const platform = value.platform === 'facebook' ? 'facebook' : 'instagram';
          const hasInfoKeyword = /(^|\s)info(\s|$)/i.test(text);
          const existingLead = await Lead.findOne({ userId: ownerId, username: senderId, platform });
          if (!existingLead && !hasInfoKeyword) continue;

          const claimed = await InboundEvent.findOneAndUpdate(
            { externalEventId: eventId },
            { $setOnInsert: { userId: ownerId, externalEventId: eventId, channel: platform, eventType: change.field ?? 'comment', senderId, text, mediaId: value.media?.id, matchedKeyword: hasInfoKeyword ? 'INFO' : undefined } },
            { upsert: true, new: true, rawResult: true },
          );
          if (claimed.lastErrorObject?.updatedExisting) continue;

          const inboundEvent = claimed.value;
          if (!inboundEvent) continue;

          let lead = existingLead;
          const isNewLead = !lead;
          if (!lead) {
            const created = await LeadService.createLead(ownerId, { username: senderId, platform, source: `${platform}_info`, status: 'new', tags: ['INFO'] });
            lead = await Lead.findById(created._id);
          }
          if (!lead) throw new Error('No fue posible crear el lead');
          const conversation = await ConversationService.getOrCreateConversation(ownerId, lead._id.toString());
          await ConversationService.addMessage(conversation._id.toString(), ownerId, { sender: 'lead', text, platform: 'instagram' });
          await AlmaService.processMessage({ userId: ownerId, leadId: lead._id.toString(), conversationId: conversation._id.toString(), text, isNewLead, platform });
        }
      }
      return res.sendStatus(200);
    } catch (error) {
      console.error('Meta webhook error', error);
      return res.sendStatus(500);
    }
  }
}
