import Lead from '../models/Lead';
import { AssistedResponseService } from './AssistedResponseService';

type Context = { userId: string; leadId: string; conversationId: string; sourceEventId: string; text: string; isNewLead: boolean };

export class WhatsAppAssistedService {
  static async process(context: Context) {
    const lead: any = await Lead.findOne({ _id: context.leadId, userId: context.userId }).select('phone').lean();
    if (!lead?.phone) throw new Error('Lead de WhatsApp sin teléfono');
    return AssistedResponseService.process({ ...context, platform: 'whatsapp', recipient: { type: 'whatsapp_user', phoneNumber: lead.phone } });
  }
}
