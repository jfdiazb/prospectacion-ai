import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import AssistedProposal from '../models/AssistedProposal';
import Task from '../models/Task';
import { ConversationService } from './ConversationService';
import { TaskService } from './TaskService';
import { getAIProvider } from '../integrations/ai';
import { AlmaService } from './AlmaService';
import { analyzeWhatsAppConversation } from './WhatsAppQualificationService';
import type { MessagingRecipient } from '../integrations/messaging';
import { MeetingOrchestratorService } from './MeetingOrchestratorService';
import { CommercialContextService } from './CommercialContextService';
import { QualificationApplicationService } from './QualificationApplicationService';
import Meeting from '../models/Meeting';
import { MeetingReadinessService } from './MeetingReadinessService';
import { LaunchAttributionService } from './LaunchAttributionService';

type AssistedPlatform = 'whatsapp' | 'instagram' | 'facebook';
type Context = { userId: string; leadId: string; conversationId: string; sourceEventId: string; text: string; isNewLead: boolean; platform: AssistedPlatform; recipient: MessagingRecipient };

export class AssistedResponseService {
  static recipientRecord(recipient: MessagingRecipient): { type: string; externalId: string } {
    if (recipient.type === 'whatsapp_user') return { type: recipient.type, externalId: recipient.phoneNumber };
    if (recipient.type === 'instagram_user') return { type: recipient.type, externalId: recipient.instagramScopedId };
    if (recipient.type === 'facebook_user') return { type: recipient.type, externalId: recipient.pageScopedId };
    if (recipient.type === 'comment' || recipient.type === 'instagram_comment' || recipient.type === 'facebook_comment') return { type: recipient.type === 'comment' ? 'instagram_comment' : recipient.type, externalId: recipient.commentId };
    throw new Error('El destinatario no admite propuestas asistidas');
  }

  static async process(context: Context) {
    const recent = await ConversationService.getRecentMessages(context.conversationId, context.userId);
    const leadTexts = recent.filter((m: any) => m.sender === 'lead').map((m: any) => m.text).filter(Boolean);
    const commercialContext: any = await CommercialContextService.getActive(context.userId);
    if (!leadTexts.length || leadTexts[leadTexts.length - 1] !== context.text) leadTexts.push(context.text);
    const qualification = analyzeWhatsAppConversation(leadTexts, commercialContext);
    const launchAttribution = await LaunchAttributionService.resolve(context.userId, context.leadId, context.conversationId);
    const meetingReadiness = MeetingReadinessService.evaluate(leadTexts, qualification, launchAttribution);
    const handoffReason = AlmaService.detectHandoffReason(context.text);
    const applied = await QualificationApplicationService.apply({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, platform: context.platform, source: 'assisted_qualification', text: context.text, isNewLead: context.isNewLead, commercialContextId: commercialContext?._id, launchId: launchAttribution?.launchId, launchParticipantId: launchAttribution?.participantId, meetingReadiness, evaluation: qualification });
    await Lead.updateOne({ _id: context.leadId, userId: context.userId }, { $set: { currentChannel: context.platform } });
    await LaunchAttributionService.recordReadiness(context.userId, launchAttribution, meetingReadiness, ['warm', 'hot'].includes(applied.current.interestLevel));
    const history = recent.slice(-10).filter((m: any) => ['lead', 'ai'].includes(m.sender)).map((m: any) => ({ sender: m.sender as 'lead' | 'ai', text: String(m.text).slice(0, 1000) }));
    const memory = await ConversationService.getOrInitializeAIMemory(context.conversationId, context.userId);
    const ai = getAIProvider();
    const generated = await ai.generateReply({ incomingText: context.text, isNewLead: context.isNewLead, intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, platform: context.platform, history: history.slice(0, -1), askedTopics: memory.askedTopics,
      commercialContext: commercialContext ? { brandName: commercialContext.brandName, businessType: commercialContext.businessType, commercialLines: commercialContext.commercialLines, allowedInformation: commercialContext.allowedInformation, informationPendingConfirmation: commercialContext.informationPendingConfirmation, communicationRules: commercialContext.communicationRules, restrictions: commercialContext.restrictions, disclaimers: commercialContext.disclaimers } : undefined });
    const meetingOutcome = await MeetingOrchestratorService.process({
      userId: context.userId, leadId: context.leadId, conversationId: context.conversationId,
      sourceEventId: context.sourceEventId, text: context.text, platform: context.platform,
      wantsMeeting: !handoffReason && meetingReadiness.ready,
      meetingReadiness: meetingReadiness.reason,
      launchId: launchAttribution?.launchId, launchParticipantId: launchAttribution?.participantId,
    });
    const deduplicated = meetingOutcome.reply
      ? { text: meetingOutcome.reply, usedFallback: false }
      : AlmaService.avoidRepeatedResponse(generated.text, history.slice(0, -1), memory, context.text);
    await ConversationService.reserveAIResponse(context.conversationId, context.userId, deduplicated.text);
    const schedulingMeeting: any = meetingOutcome.reply ? await Meeting.findOne({ userId: context.userId, conversationId: context.conversationId }).sort({ createdAt: -1 }) : null;
    const conversationState: any = schedulingMeeting ? await Conversation.findOne({ _id: context.conversationId, userId: context.userId }).select('lastMessage') : null;
    const proposal = await AssistedProposal.findOneAndUpdate({ userId: context.userId, sourceEventId: context.sourceEventId }, { $setOnInsert: {
      userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId,
      platform: context.platform, recipient: this.recipientRecord(context.recipient), text: deduplicated.text, originalText: deduplicated.text, purpose: schedulingMeeting ? 'meeting_scheduling' : 'conversation_response', status: 'proposed',
      expiresAt: schedulingMeeting ? (schedulingMeeting.optionsExpiresAt || new Date(Date.now() + 86400000)) : undefined,
      contextSnapshot: schedulingMeeting ? { leadStatus: applied.current.status, channel: context.platform, conversationLastMessageAt: conversationState?.lastMessage, meetingId: schedulingMeeting._id.toString(), meetingStatus: schedulingMeeting.status, meetingScheduledFor: schedulingMeeting.scheduledFor || schedulingMeeting.scheduledAt } : undefined,
    } }, { upsert: true, new: true });
    await Conversation.updateOne({ _id: context.conversationId, userId: context.userId }, { $set: { 'aiAnalysis.intent': qualification.intent, 'aiAnalysis.recommendedResponse': proposal.text } });
    if (handoffReason) {
      await Conversation.updateOne({ _id: context.conversationId, userId: context.userId }, { $set: { controlMode: 'handoff_requested', handoffReason, handoffRequestedAt: new Date() } });
      await Task.findOneAndUpdate({ userId: context.userId, conversationId: context.conversationId, type: 'other', status: 'pending', 'metadata.handoffReason': handoffReason }, { $setOnInsert: {
        userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, title: 'Intervención humana solicitada', description: 'El prospecto solicitó atención humana. Revisa la propuesta antes de responder.', type: 'other', status: 'pending', priority: 'high', dueDate: new Date(), metadata: { handoffReason },
      } }, { upsert: true, new: true });
    }
    if (applied.current.status !== 'rejected') await TaskService.upsertPendingFollowUp(context.userId, { leadId: context.leadId, conversationId: context.conversationId, title: qualification.signals.meetingIntent === 'high' ? 'Revisar candidato a reunión' : 'Seguimiento sugerido', description: 'Revisar la conversación y aprobar, editar o descartar la respuesta propuesta.', type: 'follow_up', status: 'pending', priority: qualification.signals.meetingIntent === 'high' ? 'high' : 'medium', dueDate: new Date(Date.now() + 86400000), metadata: { suggestedOnly: true, meetingIntent: qualification.signals.meetingIntent, platform: context.platform, followUpPurpose: 'assisted_conversation_review', sourceEventId: context.sourceEventId, origins: ['assisted_ingestion'] } });
    console.info('Assisted proposal created', { event: 'assisted_proposal_created', platform: context.platform, score: qualification.score });
    return proposal;
  }
}
