import crypto from 'crypto';
import Conversation from '../models/Conversation';
import InboundEvent from '../models/InboundEvent';
import Lead from '../models/Lead';
import { Types } from 'mongoose';

export type WhatsAppInboundDiagnosticQuery = {
  from: Date;
  to: Date;
  textSha256: string;
};

export class WhatsAppInboundDiagnosticsService {
  static async inspect(userId: string, query: WhatsAppInboundDiagnosticQuery) {
    const candidates: any[] = await InboundEvent.find({
      userId,
      channel: 'whatsapp',
      eventTimestamp: { $gte: query.from, $lte: query.to },
    })
      .select('_id externalEventId senderId eventTimestamp processingState processingAttempts conversationRecordedAt processedAt text')
      .lean();
    const matches = candidates.filter(item =>
      crypto.createHash('sha256').update(String(item.text || ''), 'utf8').digest('hex') === query.textSha256
    );
    const externalIds = [...new Set(matches.map(item => String(item.externalEventId)))];
    const senders = [...new Set(matches.map(item => String(item.senderId)))];
    const leads: any[] = senders.length
      ? await Lead.find({ userId, platform: 'whatsapp', phone: { $in: senders } }).select('_id').lean()
      : [];
    const leadIds = leads.map(item => item._id);
    const [conversationCount, messagePersistenceCount] = await Promise.all([
      leadIds.length && externalIds.length ? Conversation.countDocuments({ userId, leadId: { $in: leadIds }, messages: { $elemMatch: { platform: 'whatsapp', direction: 'inbound', externalMessageId: { $in: externalIds } } } }) : 0,
      externalIds.length
        ? Conversation.aggregate([
            { $match: { userId: new Types.ObjectId(userId), leadId: { $in: leadIds } } },
            { $unwind: '$messages' },
            { $match: { 'messages.platform': 'whatsapp', 'messages.direction': 'inbound', 'messages.externalMessageId': { $in: externalIds } } },
            { $count: 'count' },
          ]).then(rows => rows[0]?.count || 0)
        : 0,
    ]);
    return {
      inboundEventCount: matches.length,
      uniqueExternalEventCount: externalIds.length,
      messagePersistenceCount,
      leadMatchCount: leads.length,
      conversationMatchCount: conversationCount,
      events: matches.map(item => ({
        externalEventHash: crypto.createHash('sha256').update(String(item.externalEventId)).digest('hex'),
        eventTimestamp: item.eventTimestamp,
        processingState: item.processingState,
        processingAttempts: item.processingAttempts,
        conversationRecorded: Boolean(item.conversationRecordedAt),
        processedAt: item.processedAt,
      })),
      outboundMode: process.env.WHATSAPP_MESSAGING_MODE || 'mock',
      autoReplyEnabled: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true',
    };
  }
}
