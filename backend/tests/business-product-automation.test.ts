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
import { MockAIProvider } from '../src/integrations/ai/MockAIProvider';
import { AssistedResponseService } from '../src/services/AssistedResponseService';
import { ConversationService } from '../src/services/ConversationService';

describe('Interés combinado → Calificación asistida', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); process.env.AI_MODE = 'mock'; });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => { jest.restoreAllMocks(); await Promise.all([AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({}), AssistedProposal.deleteMany({}), CommercialContext.deleteMany({}), Conversation.deleteMany({}), Lead.deleteMany({}), Meeting.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const analyze = async (texts: string[]) => analyzeWhatsAppConversation(texts, await CommercialContextService.getActive(ownerA));
  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook', text = 'Me interesan los productos y también quisiera conocer el negocio.') => {
    const context: any = await CommercialContextService.getActive(ownerA); const qualification = analyzeWhatsAppConversation([text], context);
    const lead: any = await Lead.create({ userId: ownerA, username: `${platform}-${new mongoose.Types.ObjectId()}`, platform, status: qualification.status, score: qualification.score, interestLevel: 'warm', tags: qualification.tags, commercialContextId: context._id, normalizedIntent: qualification.normalizedIntent, normalizedIntents: [qualification.normalizedIntent], qualification: { intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, meetingIntent: qualification.signals.meetingIntent } });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    const recipient = { type: `${platform}_user`, externalId: `${platform}-recipient` };
    const event: AutomationEvent = { eventId: `combined-${platform}-${new mongoose.Types.ObjectId()}`, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform, text, recipient, data: { score: qualification.score, status: qualification.status, tags: qualification.tags, normalizedIntent: qualification.normalizedIntent, commercialContextId: context._id.toString(), meetingIntent: qualification.signals.meetingIntent } };
    return { lead, qualification, event };
  };

  test('materializes one generic owner-scoped inactive draft only on request', async () => {
    expect(await AutomationFlow.countDocuments({})).toBe(0);
    const first: any = await AutomationService.ensureBusinessProductTemplate(ownerA); const same: any = await AutomationService.ensureBusinessProductTemplate(ownerA); const other: any = await AutomationService.ensureBusinessProductTemplate(ownerB);
    expect(first._id.toString()).toBe(same._id.toString()); expect(first._id.toString()).not.toBe(other._id.toString());
    expect(first).toMatchObject({ name: 'Interés combinado → Calificación asistida', status: 'draft', isActive: false, trigger: { type: 'message.received' }, conditionLogic: 'AND' });
    expect(first.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'normalizedIntent', value: 'business_and_product_interest' }), expect.objectContaining({ field: 'leadId', operator: 'exists' }), expect.objectContaining({ field: 'commercialContextId', operator: 'exists' })]));
    expect(first.actions.map((item: any) => item.type)).toEqual(['add_tag', 'generate_ai_response', 'suggest_followup']);
    expect(JSON.stringify(first.toObject()).toLowerCase()).not.toMatch(/amway|nutrilite/);
  });

  test.each([
    'Me interesan los productos y también quisiera conocer el negocio.',
    'Quiero usar los productos, pero también saber cómo funciona la oportunidad.',
    'Me gustaría conocer los productos y ver si también puedo desarrollar un negocio.',
    'Quiero saber qué productos manejan y cómo funciona el negocio.',
  ])('recognizes explicit combined interest: %s', async text => {
    const result = await analyze([text]); expect(result.normalizedIntent).toBe('business_and_product_interest'); expect(result.tags).toEqual(expect.arrayContaining(['interes_productos', 'interes_oportunidad_negocio'])); expect(result.signals.meetingIntent).not.toBe('high'); expect(result.score).toBeGreaterThanOrEqual(70);
  });

  test.each([
    [['Quiero conocer los productos.', 'También quisiera conocer el negocio.'], 'business_and_product_interest'],
    [['Quiero conocer el negocio.', 'También me interesan los productos.'], 'business_and_product_interest'],
    [['Estoy buscando una forma de generar ingresos adicionales.', 'También me interesan los productos.'], 'business_and_product_interest'],
    [['Me interesan los productos y el negocio.', 'Primero quiero conocer los productos.'], 'product_interest'],
    [['Me interesan los productos y el negocio.', 'Primero quisiera entender cómo funciona el negocio.'], 'business_opportunity'],
    [['Me interesan los productos y el negocio.', 'En realidad lo que quiero es vender los productos.'], 'product_sales_interest'],
    [['Me interesan los productos y el negocio.', 'Quiero conocer las dos cosas.'], 'business_and_product_interest'],
  ])('evolves the current priority while retaining historical signals: %j', async (texts, expected) => {
    const result = await analyze(texts as string[]); expect(result.normalizedIntent).toBe(expected); expect(result.tags).toContain('interes_productos'); expect(result.tags.some(tag => ['interes_oportunidad_negocio', 'interes_ingresos_adicionales'].includes(tag))).toBe(true);
  });

  test('does not repeat the prioritization question when it was already asked', async () => {
    const provider = new MockAIProvider();
    const first = await provider.generateReply({ incomingText: 'Me interesan ambas cosas.', isNewLead: false, intent: 'interest', normalizedIntent: 'business_and_product_interest', platform: 'whatsapp', history: [] });
    const next = await provider.generateReply({ incomingText: 'Quiero conocer las dos cosas.', isNewLead: false, intent: 'interest', normalizedIntent: 'business_and_product_interest', platform: 'whatsapp', history: [{ sender: 'ai', text: first.text }] });
    expect(first.text).toMatch(/productos.*(?:o|negocio).*negocio/i); expect(next.text).not.toBe(first.text); expect(next.text).not.toMatch(/prefieres empezar por conocer los productos/i);
  });

  test('keeps rejection and explicit meeting intent separate from combined interest', async () => {
    expect((await analyze(['Me interesan productos y negocio.', 'No me interesa continuar.'])).normalizedIntent).toBe('rejection');
    const meeting = await analyze(['Me interesan los productos y el negocio, ¿podemos hablar mañana?']); expect(meeting.normalizedIntent).toBe('meeting'); expect(meeting.signals.meetingIntent).toBe('high');
    expect((await analyze(['Me interesan los productos y el negocio.'])).signals.meetingIntent).toBe('medium');
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('runs idempotently and assisted-only on %s', async platform => {
    const prepared = await prepare(platform); const template: any = await AutomationService.ensureBusinessProductTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AutomationEngineService.emit(prepared.event); await AutomationEngineService.emit(prepared.event);
    const lead: any = await Lead.findById(prepared.lead._id).lean(); expect(lead.tags.filter((tag: string) => tag === 'interes_negocio_y_productos')).toHaveLength(1);
    expect(await AutomationExecution.countDocuments({ automationId: template._id })).toBe(1); expect(await AssistedProposal.countDocuments({ userId: ownerA, platform })).toBe(1); expect(await Task.countDocuments({ userId: ownerA })).toBe(1);
    expect(await OutboundMessage.countDocuments({})).toBe(0); expect(await Meeting.countDocuments({})).toBe(0);
  });

  test('reuses the ingestion proposal and follow-up for the same conversational event', async () => {
    const context: any = await CommercialContextService.getActive(ownerA); const text = 'Me interesan los productos y también quisiera conocer el negocio.'; const eventId = 'combined-full-path-1';
    const lead: any = await Lead.create({ userId: ownerA, username: 'combined-full-path', platform: 'whatsapp', status: 'new', score: 0, tags: [], commercialContextId: context._id });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    await ConversationService.addMessage(conversation._id.toString(), ownerA, { sender: 'lead', text, platform: 'whatsapp', direction: 'inbound', status: 'received' } as any);
    const template: any = await AutomationService.ensureBusinessProductTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AssistedResponseService.process({ userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: eventId, text, isNewLead: true, platform: 'whatsapp', recipient: { type: 'whatsapp_user', phoneNumber: '+573001112233' } });
    const refreshed: any = await Lead.findById(lead._id).lean(); const event: AutomationEvent = { eventId, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform: 'whatsapp', text, recipient: { type: 'whatsapp_user', externalId: '+573001112233' }, data: { score: refreshed.score, status: refreshed.status, tags: refreshed.tags, normalizedIntent: refreshed.normalizedIntent, commercialContextId: refreshed.commercialContextId.toString(), meetingIntent: refreshed.qualification.meetingIntent } };
    await AutomationEngineService.emit(event); await AutomationEngineService.emit(event);
    const task: any = await Task.findOne({ userId: ownerA, leadId: lead._id }).lean(); expect(await Task.countDocuments({ userId: ownerA, leadId: lead._id })).toBe(1); expect(task.metadata).toMatchObject({ followUpPurpose: 'assisted_conversation_review', origins: expect.arrayContaining(['assisted_ingestion', 'automation']), sourceEventIds: [eventId] });
    expect(await AssistedProposal.countDocuments({ userId: ownerA, sourceEventId: eventId })).toBe(1); expect(await OutboundMessage.countDocuments({})).toBe(0); expect(await Meeting.countDocuments({})).toBe(0);
  });

  test.each([
    ['Quiero conocer los productos.', 'product_interest'],
    ['Quiero vender productos.', 'product_sales_interest'],
    ['Quiero conocer el negocio.', 'business_opportunity'],
    ['Busco ingresos adicionales.', 'additional_income_interest'],
    ['No me interesa.', 'rejection'],
  ])('does not capture another commercial route: %s', async (text, expected) => {
    const prepared = await prepare('whatsapp', text); expect(prepared.qualification.normalizedIntent).toBe(expected); const template: any = await AutomationService.ensureBusinessProductTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0);
  });

  test('does not execute another owner template', async () => {
    const prepared = await prepare('facebook'); const template: any = await AutomationService.ensureBusinessProductTemplate(ownerB); await AutomationService.setStatus(template._id, ownerB, 'active'); expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0); expect(await AutomationExecution.countDocuments({ userId: ownerB })).toBe(0);
  });
});
