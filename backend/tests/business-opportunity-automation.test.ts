import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AutomationFlow from '../src/models/AutomationFlow';
import AutomationExecution from '../src/models/AutomationExecution';
import AssistedProposal from '../src/models/AssistedProposal';
import CommercialContext from '../src/models/CommercialContext';
import Conversation from '../src/models/Conversation';
import Lead from '../src/models/Lead';
import Meeting from '../src/models/Meeting';
import OutboundMessage from '../src/models/OutboundMessage';
import Task from '../src/models/Task';
import { AutomationService } from '../src/services/AutomationService';
import { AutomationEngineService, type AutomationEvent } from '../src/services/AutomationEngineService';
import { CommercialContextService } from '../src/services/CommercialContextService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
import { GeminiAIProvider } from '../src/integrations/ai/GeminiAIProvider';
import { GeminiService } from '../src/services/GeminiService';
import { AssistedResponseService } from '../src/services/AssistedResponseService';
import { ConversationService } from '../src/services/ConversationService';
import { TaskService } from '../src/services/TaskService';

describe('Oportunidad de negocio → Calificación asistida', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); process.env.AI_MODE = 'mock'; });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => { jest.restoreAllMocks(); await Promise.all([AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({}), AssistedProposal.deleteMany({}), CommercialContext.deleteMany({}), Conversation.deleteMany({}), Lead.deleteMany({}), Meeting.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook', text = 'Quiero conocer el negocio.') => {
    const context: any = await CommercialContextService.getActive(ownerA); const qualification = analyzeWhatsAppConversation([text], context);
    const lead: any = await Lead.create({ userId: ownerA, username: `${platform}-${new mongoose.Types.ObjectId()}`, platform, status: qualification.status, score: qualification.score, interestLevel: qualification.score >= 50 ? 'warm' : 'cold', tags: [], commercialContextId: context._id, normalizedIntent: qualification.normalizedIntent, normalizedIntents: [qualification.normalizedIntent], qualification: { intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, meetingIntent: qualification.signals.meetingIntent } });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    const recipient = platform === 'whatsapp' ? { type: 'whatsapp_user', externalId: '+573001112233' } : platform === 'instagram' ? { type: 'instagram_user', externalId: 'ig-user' } : { type: 'facebook_user', externalId: 'fb-user' };
    const event: AutomationEvent = { eventId: `business-${platform}-${new mongoose.Types.ObjectId()}`, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform, source: `${platform}_test`, text, recipient, data: { score: qualification.score, status: qualification.status, tags: qualification.tags, normalizedIntent: qualification.normalizedIntent, commercialContextId: context._id.toString(), meetingIntent: qualification.signals.meetingIntent } };
    return { qualification, lead, event };
  };

  test('materializes one generic owner-scoped draft with assisted-only actions', async () => {
    const first: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); const same: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); const other: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerB);
    expect(first._id.toString()).toBe(same._id.toString()); expect(first._id.toString()).not.toBe(other._id.toString());
    expect(first).toMatchObject({ name: 'Oportunidad de negocio → Calificación asistida', status: 'draft', isActive: false, trigger: { type: 'message.received' } });
    expect(first.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'normalizedIntent', value: 'business_opportunity' }), expect.objectContaining({ field: 'leadId', operator: 'exists' })]));
    expect(first.actions.map((item: any) => item.type)).toEqual(['add_tag', 'generate_ai_response', 'suggest_followup']);
    expect(first.actions.map((item: any) => item.type)).not.toEqual(expect.arrayContaining(['update_score', 'change_status', 'mark_meeting_candidate']));
    expect(JSON.stringify(first.toObject()).toLowerCase()).not.toContain('amway');
  });

  test.each(['Quiero conocer el negocio.', 'Me interesa una oportunidad de negocio.', 'Quiero emprender.', 'Quiero construir algo propio.', 'Me gustaría formar un equipo.', 'Quiero conocer cómo funciona el modelo.', 'Estoy buscando una oportunidad para emprender.'])('recognizes explicit business opportunity: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('business_opportunity'); expect(result.tags).toContain('interes_oportunidad_negocio'); expect(result.signals.meetingIntent).not.toBe('high');
  });

  test.each(['Quiero conocer cómo funciona el negocio.', 'Quisiera saber cómo funciona el modelo de negocio.', 'Explícame de qué se trata la oportunidad.', 'Quiero entender la oportunidad.', 'Quiero saber de qué se trata el negocio.', 'Explícame cómo funciona el negocio.'])('recognizes contextual exploration without relying on one literal phrase: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('business_opportunity'); expect(result.tags).toContain('interes_oportunidad_negocio');
  });

  test.each([
    ['Quiero vender algunos productos.', 'product_sales_interest'],
    ['¿Puedo ganar dinero vendiendo estos productos?', 'product_sales_interest'],
    ['Me interesan los productos, pero también quisiera conocer la oportunidad de negocio.', 'business_and_product_interest'],
    ['Negocio', 'undetermined'],
  ])('keeps sales, combined and insufficient intent separate: %s', async (text, expected) => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation([text], context).normalizedIntent).toBe(expected);
  });

  test.each([
    [['Estoy buscando una forma de generar ingresos adicionales.'], 'additional_income_interest'],
    [['Estoy buscando una forma de generar ingresos adicionales.', 'Sí, me interesa conocer una oportunidad de negocio.'], 'business_opportunity'],
    [['Quiero vender productos.', 'Pero también me gustaría construir un negocio y formar un equipo.'], 'business_and_product_interest'],
    [['Quiero conocer los productos.', 'Ahora quiero conocer la oportunidad de negocio.'], 'business_and_product_interest'],
    [['Quiero conocer el negocio.', 'También me interesan los productos.'], 'business_and_product_interest'],
  ])('evolves conversation without reclassifying history incorrectly: %j', async (texts, expected) => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation(texts as string[], context).normalizedIntent).toBe(expected);
  });

  test('records only declared business experience and does not penalize a first experience', async () => {
    const context: any = await CommercialContextService.getActive(ownerA);
    const experienced = analyzeWhatsAppConversation(['Quiero emprender. Ya tuve un negocio y manejé un equipo.'], context);
    const firstTime = analyzeWhatsAppConversation(['Quiero emprender. Sería mi primer negocio.'], context);
    expect(experienced.signals.businessExperience).toBe('experiencia_declarada'); expect(firstTime.signals.businessExperience).toBe('sin_experiencia_declarada');
    expect(firstTime.signals.entrepreneurshipOpenness).toBe(experienced.signals.entrepreneurshipOpenness); expect(firstTime.signals.commercialExperience).toBe(15);
  });

  test('keeps business interest separate from explicit meeting intent', async () => {
    const context: any = await CommercialContextService.getActive(ownerA);
    expect(analyzeWhatsAppConversation(['Quiero conocer el negocio.'], context).signals.meetingIntent).not.toBe('high');
    expect(analyzeWhatsAppConversation(['Quiero conocer el negocio, ¿podemos hablar mañana?'], context).signals.meetingIntent).toBe('high');
  });

  test('adds the explicit business signal in the complete four-message evolution', async () => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([
      'Estoy buscando una forma de generar ingresos adicionales.', 'También me interesan los productos.',
      'Incluso podría venderlos si son productos que me gustan.', 'Pero realmente quisiera conocer cómo funciona el negocio y saber si esto podría ser para mí.',
    ], context);
    expect(result.normalizedIntent).toBe('business_and_product_interest'); expect(result.tags).toEqual(expect.arrayContaining(['interes_ingresos_adicionales', 'interes_productos', 'interes_venta_productos', 'interes_oportunidad_negocio']));
  });

  test.each(['No me interesa.', 'No quiero ese negocio.', 'No quiero saber más.'])('respects rejection: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('rejection'); expect(result.status).toBe('rejected');
  });

  test('passes the active brand to Gemini without hardcoding it in the automation', async () => {
    const generate = jest.spyOn(GeminiService, 'generateResponse').mockResolvedValue('Respuesta segura');
    await new GeminiAIProvider().generateReply({ incomingText: '¿De qué empresa se trata?', isNewLead: false, intent: 'interest', normalizedIntent: 'business_opportunity', platform: 'whatsapp', history: [], commercialContext: { brandName: 'Amway', businessType: 'oportunidad de negocio', allowedInformation: ['Nombre de la marca activa'], restrictions: ['No prometer ingresos'] } });
    const prompt = String(generate.mock.calls[0][0]); expect(prompt).toContain('Contexto comercial activo: Amway'); expect(prompt).toContain('transparencia'); expect(prompt).toContain('No prometer ingresos');
  });

  test('creates one CRM proposal and task without outbound, meeting, score or status mutation', async () => {
    const prepared = await prepare('whatsapp'); const template: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); const before = { score: prepared.lead.score, status: prepared.lead.status };
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(1); expect(await Lead.findById(prepared.lead._id)).toMatchObject({ ...before, tags: expect.arrayContaining(['interes_oportunidad_negocio']) });
    const proposal: any = await AssistedProposal.findOne({ userId: ownerA }); expect(proposal).toMatchObject({ platform: 'whatsapp', status: 'proposed' }); expect(proposal.text).not.toMatch(/ingresos? (?:garantizados?|asegurados?)|ganarás|resultado garantizado|empleo disponible/i);
    expect(await Task.countDocuments({ userId: ownerA })).toBe(1); expect(await OutboundMessage.countDocuments({})).toBe(0); expect(await Meeting.countDocuments({})).toBe(0);
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('runs safely and idempotently on %s', async platform => {
    const prepared = await prepare(platform); const template: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AutomationEngineService.emit(prepared.event); await AutomationEngineService.emit(prepared.event);
    expect(await AutomationExecution.countDocuments({ automationId: template._id })).toBe(1); expect(await AssistedProposal.countDocuments({ userId: ownerA, platform })).toBe(1); expect(await Task.countDocuments({ userId: ownerA })).toBe(1);
    expect((await Lead.findById(prepared.lead._id))?.tags.filter(tag => tag === 'interes_oportunidad_negocio')).toHaveLength(1);
  });

  test.each(['Quiero conocer los productos.', 'Quiero vender productos.', 'Me interesan los productos y el negocio.', 'No me interesa.'])('does not execute for another intent: %s', async text => {
    const prepared = await prepare('instagram', text); const template: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0);
  });

  test('does not execute another owner template', async () => {
    const prepared = await prepare('facebook'); const other: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerB); await AutomationService.setStatus(other._id, ownerB, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0); expect(await AutomationExecution.countDocuments({ userId: ownerB })).toBe(0);
  });

  test('consolidates ingestion and automation follow-up while preserving traceability', async () => {
    const context: any = await CommercialContextService.getActive(ownerA);
    const lead: any = await Lead.create({ userId: ownerA, username: 'full-path', platform: 'whatsapp', status: 'new', score: 0, tags: [], commercialContextId: context._id });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id }); const eventId = 'full-path-business-1'; const text = 'Quiero conocer cómo funciona el negocio.';
    await ConversationService.addMessage(conversation._id.toString(), ownerA, { sender: 'lead', text, platform: 'whatsapp', direction: 'inbound', status: 'received' } as any);
    await AssistedResponseService.process({ userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: eventId, text, isNewLead: true, platform: 'whatsapp', recipient: { type: 'whatsapp_user', phoneNumber: '+573001112233' } });
    const template: any = await AutomationService.ensureBusinessOpportunityTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); const refreshed: any = await Lead.findById(lead._id).lean();
    const event: AutomationEvent = { eventId, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform: 'whatsapp', text, recipient: { type: 'whatsapp_user', externalId: '+573001112233' }, data: { score: refreshed.score, status: refreshed.status, tags: refreshed.tags, normalizedIntent: refreshed.normalizedIntent, commercialContextId: refreshed.commercialContextId.toString(), meetingIntent: refreshed.qualification.meetingIntent } };
    await AutomationEngineService.emit(event); await AutomationEngineService.emit(event);
    const tasks: any[] = await Task.find({ userId: ownerA, leadId: lead._id }).lean(); expect(tasks).toHaveLength(1);
    expect(tasks[0].metadata).toMatchObject({ followUpPurpose: 'assisted_conversation_review', origins: expect.arrayContaining(['assisted_ingestion', 'automation']), sourceEventIds: [eventId], automationId: template._id.toString() });
    expect(await AssistedProposal.countDocuments({ userId: ownerA, sourceEventId: eventId })).toBe(1);
  });

  test('keeps genuinely different follow-up purposes and owners separate', async () => {
    const leadA = new mongoose.Types.ObjectId(); const conversationA = new mongoose.Types.ObjectId(); const shared = { leadId: leadA as any, conversationId: conversationA as any, type: 'follow_up' as const, status: 'pending' as const, priority: 'medium' as const, dueDate: new Date(), description: 'Revisar' };
    await TaskService.upsertPendingFollowUp(ownerA, { ...shared, title: 'Revisión asistida', metadata: { followUpPurpose: 'assisted_conversation_review', sourceEventId: 'event-a', origins: ['assisted_ingestion'] } });
    await TaskService.upsertPendingFollowUp(ownerA, { ...shared, title: 'Revisión de cumplimiento', metadata: { followUpPurpose: 'compliance_review', sourceEventId: 'event-a', origins: ['automation'] } });
    await TaskService.upsertPendingFollowUp(ownerB, { ...shared, title: 'Revisión asistida', metadata: { followUpPurpose: 'assisted_conversation_review', sourceEventId: 'event-a', origins: ['assisted_ingestion'] } });
    expect(await Task.countDocuments({ userId: ownerA })).toBe(2); expect(await Task.countDocuments({ userId: ownerB })).toBe(1);
  });

  test('adopts a compatible legacy assisted follow-up instead of duplicating it', async () => {
    const leadId = new mongoose.Types.ObjectId(); const conversationId = new mongoose.Types.ObjectId();
    const legacy: any = await Task.create({ userId: ownerA, leadId, conversationId, title: 'Seguimiento sugerido', description: 'Anterior', type: 'follow_up', status: 'pending', priority: 'medium', metadata: { suggestedOnly: true, platform: 'whatsapp' } });
    const updated: any = await TaskService.upsertPendingFollowUp(ownerA, { leadId: leadId as any, conversationId: conversationId as any, title: 'Seguimiento sugerido', description: 'Actualizado', type: 'follow_up', status: 'pending', priority: 'medium', metadata: { suggestedOnly: true, followUpPurpose: 'assisted_conversation_review', sourceEventId: 'event-new', origins: ['assisted_ingestion'] } });
    expect(updated._id.toString()).toBe(legacy._id.toString()); expect(await Task.countDocuments({ userId: ownerA })).toBe(1); expect(updated.metadata.followUpPurpose).toBe('assisted_conversation_review');
  });
});
