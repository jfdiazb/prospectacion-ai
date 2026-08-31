import Lead from '../models/Lead';
import Activity from '../models/Activity';
import { ConversationService } from './ConversationService';
import { TaskService } from './TaskService';
import { getAIProvider } from '../integrations/ai';
import { MessagingService } from './MessagingService';
import type { MessagingRecipient } from '../integrations/messaging';
import { MeetingOrchestratorService } from './MeetingOrchestratorService';
import { AutomationService } from './AutomationService';
import Conversation from '../models/Conversation';
import { CommercialContextService } from './CommercialContextService';
import { analyzeWhatsAppConversation } from './WhatsAppQualificationService';
import { QualificationApplicationService } from './QualificationApplicationService';
import { MeetingReadinessService } from './MeetingReadinessService';

type AlmaContext = { userId: string; leadId: string; conversationId: string; text: string; isNewLead: boolean; platform: 'instagram' | 'facebook' | 'youtube' | 'whatsapp'; sourceEventId: string; recipient: MessagingRecipient; automation?: { flowId: string; response: string } };

export class AlmaService {
  private static buildNaturalContinuation(incomingText: string, history: Array<{ sender: 'lead' | 'ai'; text: string }>): string {
    const leadConversation = [...history.filter(message => message.sender === 'lead').map(message => message.text), incomingText]
      .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    if (/producto|bienestar|consumo/.test(leadConversation)) {
      return 'Perfecto 😊 ¿Qué te gustaría conocer primero sobre los productos?';
    }
    if (/negocio|ingreso|emprend|venta/.test(leadConversation)) {
      return 'Perfecto 😊 ¿Qué te gustaría lograr con esta oportunidad?';
    }
    if (/tecnologia|redes sociales|seguidores|clientes/.test(leadConversation)) {
      return 'Entiendo 😊 ¿Qué te gustaría mejorar primero?';
    }
    return 'Perfecto 😊 ¿Qué es lo que más te gustaría lograr con esto?';
  }

  static buildActionableNextStep(incomingText: string, history: Array<{ sender: 'lead' | 'ai'; text: string }>): string {
    const context = [...history.filter(message => message.sender === 'lead').map(message => message.text), incomingText]
      .join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');
    if (/tecnologia|redes sociales|seguidores|clientes/.test(context)) {
      return 'Primer paso: define en una frase a qué tipo de cliente ayudas, qué problema concreto resuelves y qué resultado ofreces. Usa esa frase como base de tu perfil y de tu próxima publicación.';
    }
    return 'Primer paso: escribe en una frase el resultado concreto que quieres lograr esta semana y elige una acción pequeña que puedas completar hoy para acercarte a él.';
  }

  static avoidRepeatedResponse(response: string, history: Array<{ sender: 'lead' | 'ai'; text: string }>, memory: { askedTopics: string[]; responseFingerprints: string[] } = { askedTopics: [], responseFingerprints: [] }, incomingText = ''): { text: string; deduplicated: boolean } {
    const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
      .replace(/[^a-z0-9]+/g, ' ').trim();
    const previousAI = new Set(history.filter(message => message.sender === 'ai').map(message => normalize(message.text)));
    const fingerprint = ConversationService.fingerprintAIText(response);
    const topic = ConversationService.classifyQuestionTopic(response);
    const exposesInternalLanguage = /\b(contexto|avanzar|proces(?:ar|ando|ado)|flujo|calificaci[oó]n|lead)\b|informaci[oó]n recopilada|intenci[oó]n detectada|no repetirte preguntas/i.test(response);
    const repeated = previousAI.has(normalize(response)) || memory.responseFingerprints.includes(fingerprint)
      || Boolean(topic && memory.askedTopics.includes(topic)) || exposesInternalLanguage;
    if (!repeated) return { text: response, deduplicated: false };
    const discoveryComplete = ['desired_outcome', 'main_obstacle', 'previous_attempts', 'support_needed']
      .every(askedTopic => memory.askedTopics.includes(askedTopic));
    const explicitlyRequestsAction = /\b(primer paso|siguiente paso|paso a paso|c[oó]mo hacerlo|ind[ií]came|expl[ií]came)\b/i.test(incomingText);
    if (discoveryComplete || explicitlyRequestsAction) {
      return { text: this.buildActionableNextStep(incomingText, history), deduplicated: true };
    }
    const replacement = this.buildNaturalContinuation(incomingText, history);
    return { text: replacement, deduplicated: true };
  }

  static async processMessage(context: AlmaContext): Promise<string> {
    const normalized = context.text.toLocaleLowerCase('es');
    const controlMode = await ConversationService.getControlMode(context.conversationId, context.userId);
    if (controlMode !== 'automated') return '';
    const handoffReason = this.detectHandoffReason(normalized);
    if (handoffReason) return await this.requestHumanHandoff(context, handoffReason);
    const recentMessages = await ConversationService.getRecentMessages(context.conversationId, context.userId);
    const commercialContext: any = await CommercialContextService.getActive(context.userId);
    const leadTexts = recentMessages.filter((message: any) => message.sender === 'lead').map((message: any) => message.text).filter(Boolean);
    if (!leadTexts.length || leadTexts[leadTexts.length - 1] !== context.text) leadTexts.push(context.text);
    const qualification = analyzeWhatsAppConversation(leadTexts, commercialContext);
    const meetingReadiness = MeetingReadinessService.evaluate(leadTexts, qualification);
    const wantsMeeting = meetingReadiness.ready;
    const applied = await QualificationApplicationService.apply({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, platform: context.platform, source: 'alma_autonomous_qualification', text: context.text, isNewLead: context.isNewLead, commercialContextId: commercialContext?._id, evaluation: qualification });
    const isRejected = applied.current.status === 'rejected';
    const score = applied.current.score;

    const intent = qualification.intent;
    if (!isRejected) {
      await Activity.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, type: 'follow_up_scheduled', description: 'Seguimiento programado para 24 horas' });
      await TaskService.upsertPendingFollowUp(context.userId, {
        leadId: context.leadId,
        conversationId: context.conversationId,
        title: 'Hacer seguimiento al prospecto',
        description: 'Revisar la conversación y dar continuidad al lead captado mediante INFO.',
        type: 'follow_up',
        status: 'pending',
        priority: wantsMeeting ? 'high' : 'medium',
        dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
        metadata: { intent, score, autoGenerated: true, meetingReadiness: meetingReadiness.reason },
      });
    }

    const latestMessage = recentMessages[recentMessages.length - 1];
    const previousMessages = latestMessage?.sender === 'lead' && latestMessage?.text === context.text
      ? recentMessages.slice(0, -1) : recentMessages;
    const history = previousMessages.slice(-10)
      .filter((message: any) => (message.sender === 'lead' || message.sender === 'ai') && typeof message.text === 'string')
      .map((message: any) => ({ sender: message.sender as 'lead' | 'ai', text: message.text.slice(0, 1000) }));
    let aiMemory = await ConversationService.getOrInitializeAIMemory(context.conversationId, context.userId);
    const automationAlreadySent = Boolean(context.automation && aiMemory.responseFingerprints.includes(
      ConversationService.fingerprintAIText(context.automation.response)));
    if (automationAlreadySent) context.automation = undefined;
    const aiProvider = context.automation ? null : getAIProvider();
    const aiResult = context.automation ? null : await aiProvider!.generateReply({ incomingText: context.text, isNewLead: context.isNewLead, intent, normalizedIntent: qualification.normalizedIntent, platform: context.platform, history, askedTopics: aiMemory.askedTopics,
      commercialContext: commercialContext ? { brandName: commercialContext.brandName, businessType: commercialContext.businessType, commercialLines: commercialContext.commercialLines, allowedInformation: commercialContext.allowedInformation, informationPendingConfirmation: commercialContext.informationPendingConfirmation, communicationRules: commercialContext.communicationRules, restrictions: commercialContext.restrictions, disclaimers: commercialContext.disclaimers } : undefined });
    const generatedResponse = context.automation?.response ?? aiResult!.text;
    const meetingOutcome = await MeetingOrchestratorService.process({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, text: context.text, wantsMeeting, meetingReadiness: meetingReadiness.reason, platform: context.platform });
    let deduplication = meetingOutcome.reply ? { text: meetingOutcome.reply, deduplicated: false }
      : this.avoidRepeatedResponse(generatedResponse, history, aiMemory, context.text);
    if (!meetingOutcome.reply && !await ConversationService.reserveAIResponse(context.conversationId, context.userId, deduplication.text)) {
      aiMemory = await ConversationService.getOrInitializeAIMemory(context.conversationId, context.userId);
      deduplication = this.avoidRepeatedResponse(generatedResponse, history, aiMemory, context.text);
      if (!await ConversationService.reserveAIResponse(context.conversationId, context.userId, deduplication.text)) {
        throw new Error('No fue posible reservar una respuesta conversacional única');
      }
    }
    const response = deduplication.text;
    const aiProviderUsed = meetingOutcome.reply ? undefined : aiResult?.aiProviderUsed;
    if (aiProviderUsed) console.info('ALMA AI response generated', {
      event: 'alma_ai_response_generated',
      aiProviderConfigured: aiProvider!.name,
      aiProviderUsed,
      deduplicated: deduplication.deduplicated,
    });

    await ConversationService.addMessage(context.conversationId, context.userId, { sender: 'ai', text: response, platform: context.platform });
    const deliveryStatus = await MessagingService.send({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, text: response, recipient: context.recipient });
    if (context.automation && deliveryStatus !== 'duplicate') await AutomationService.recordExecution(context.automation.flowId, context.userId, deliveryStatus !== 'failed');
    await Activity.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, type: 'message_generated', description: context.automation ? 'ALMA ejecutó una automatización por palabra clave' : 'ALMA generó y procesó una respuesta saliente', metadata: context.automation ? { automationFlowId: context.automation.flowId, responseSource: 'automation' } : aiProviderUsed ? { aiProvider: aiProvider!.name, aiProviderUsed } : { responseSource: 'meeting_orchestrator' } });
    return response;
  }

  static detectHandoffReason(text: string): string | null {
    if (/\b(hablar|comunicarme|contactar|pasame|pásame|quiero)\b.{0,30}\b(humano|persona|asesor|asesora|agente|dueño|propietario)\b/i.test(text)) return 'explicit_human_request';
    if (/\b(queja|reclamo|denuncia|fraude|estafa|demanda|abogado|legal)\b/i.test(text)) return 'sensitive_or_complaint';
    return null;
  }

  private static async requestHumanHandoff(context: AlmaContext, reason: string): Promise<string> {
    const reply = 'Claro. He solicitado que una persona continúe contigo. Tu conversación queda en espera de atención humana.';
    await Promise.all([
      ConversationService.addMessage(context.conversationId, context.userId, { sender: 'ai', text: reply, platform: context.platform }),
      TaskService.createTask(context.userId, {
        leadId: context.leadId, conversationId: context.conversationId, title: 'Atender conversación transferida por ALMA',
        description: 'ALMA pausó la automatización y solicitó intervención humana.', type: 'other', status: 'pending', priority: 'high', dueDate: new Date(),
        metadata: { handoffReason: reason, autoGenerated: true },
      }),
      Activity.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, type: 'handoff_requested', description: 'ALMA solicitó intervención humana', metadata: { reason } }),
    ]);
    await Lead.updateOne({ _id: context.leadId, userId: context.userId }, { $set: { nextFollowUp: null, 'followUp.lastDecision': 'cancelled', 'followUp.lastReason': 'human_handoff', 'followUp.lastDecisionAt': new Date() } });
    await Conversation.updateOne({ _id: context.conversationId, userId: context.userId }, {
      $set: { controlMode: 'handoff_requested', handoffReason: reason, handoffRequestedAt: new Date() },
    });
    await MessagingService.send({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, text: reply, recipient: context.recipient });
    return reply;
  }
}
