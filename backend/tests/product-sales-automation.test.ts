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

describe('Interés en venta de productos → Calificación comercial asistida', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); process.env.AI_MODE = 'mock'; });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => Promise.all([AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({}), AssistedProposal.deleteMany({}), CommercialContext.deleteMany({}), Conversation.deleteMany({}), Lead.deleteMany({}), Meeting.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({})]));
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook', text = 'Quiero vender los productos.') => {
    const context: any = await CommercialContextService.getActive(ownerA); const qualification = analyzeWhatsAppConversation([text], context);
    const lead: any = await Lead.create({ userId: ownerA, username: `${platform}-${new mongoose.Types.ObjectId()}`, platform, status: qualification.status, score: qualification.score, interestLevel: qualification.score >= 50 ? 'warm' : 'cold', tags: [], commercialContextId: context._id, normalizedIntent: qualification.normalizedIntent, normalizedIntents: [qualification.normalizedIntent], qualification: { intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, meetingIntent: qualification.signals.meetingIntent } });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    const recipient = platform === 'whatsapp' ? { type: 'whatsapp_user', externalId: '+573001112233' } : platform === 'instagram' ? { type: 'instagram_user', externalId: 'ig-user' } : { type: 'facebook_user', externalId: 'fb-user' };
    const event: AutomationEvent = { eventId: `sales-${platform}-${new mongoose.Types.ObjectId()}`, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform, source: `${platform}_test`, text, recipient, data: { score: qualification.score, status: qualification.status, tags: qualification.tags, normalizedIntent: qualification.normalizedIntent, commercialContextId: context._id.toString(), meetingIntent: qualification.signals.meetingIntent } };
    return { qualification, lead, event };
  };

  test('materializes one owner-scoped inactive template with assisted-only actions', async () => {
    const first: any = await AutomationService.ensureProductSalesTemplate(ownerA); const second: any = await AutomationService.ensureProductSalesTemplate(ownerA); const other: any = await AutomationService.ensureProductSalesTemplate(ownerB);
    expect(first._id.toString()).toBe(second._id.toString()); expect(other._id.toString()).not.toBe(first._id.toString());
    expect(first).toMatchObject({ name: 'Interés en venta de productos → Calificación comercial asistida', status: 'draft', isActive: false, trigger: { type: 'message.received' } });
    expect(first.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'normalizedIntent', value: 'product_sales_interest' }), expect.objectContaining({ field: 'leadId', operator: 'exists' })]));
    expect(first.actions.map((item: any) => item.type)).toEqual(['add_tag', 'generate_ai_response', 'suggest_followup']);
    expect(first.actions.map((item: any) => item.type)).not.toEqual(expect.arrayContaining(['update_score', 'change_status', 'mark_meeting_candidate']));
  });

  test.each(['Quiero vender los productos.', '¿Puedo ganar dinero vendiendo estos productos?', 'Me interesa comercializarlos.', 'Quisiera ofrecer estos productos a otras personas.'])('recognizes product sales without assuming business: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('product_sales_interest'); expect(result.tags).toContain('interes_venta_productos'); expect(result.tags).not.toContain('interes_oportunidad_negocio'); expect(result.signals.meetingIntent).not.toBe('high');
  });

  test('records declared commercial experience without inventing it', async () => {
    const context: any = await CommercialContextService.getActive(ownerA);
    const experienced = analyzeWhatsAppConversation(['Ya he vendido productos antes.'], context);
    const newSeller = analyzeWhatsAppConversation(['Quiero vender los productos.', 'Nunca he vendido nada.'], context);
    expect(experienced.normalizedIntent).toBe('product_sales_interest'); expect(experienced.signals.commercialExperience).toBeGreaterThan(80);
    expect(newSeller.normalizedIntent).toBe('product_sales_interest'); expect(newSeller.signals.commercialExperience).toBeLessThan(20); expect(newSeller.signals.productSalesAffinity).toBe('sin_experiencia_declarada');
  });

  test.each([
    [['Quiero conocer los productos.', 'También quisiera venderlos.'], 'product_sales_interest'],
    [['Quiero vender los productos.', 'Además quiero formar un equipo y desarrollar el negocio.'], 'business_and_product_interest'],
    [['Me interesan los productos y también desarrollar el negocio.'], 'business_and_product_interest'],
  ])('evolves conversational intent safely: %j', async (texts, expected) => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation(texts as string[], context);
    expect(result.normalizedIntent).toBe(expected); expect(result.signals.meetingIntent).not.toBe('high');
  });

  test.each([
    ['Quiero conocer los productos.', 'product_interest'],
    ['Quiero conocer una oportunidad de negocio.', 'business_opportunity'],
    ['No me interesa.', 'rejection'],
    ['Qué clima hace hoy.', 'undetermined'],
  ])('does not confuse negative case %s', async (text, expected) => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation([text], context).normalizedIntent).toBe(expected);
  });

  test('creates one safe CRM proposal and task without outbound, meeting, score or status mutation', async () => {
    const prepared = await prepare('whatsapp'); const template: any = await AutomationService.ensureProductSalesTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); const before = { score: prepared.lead.score, status: prepared.lead.status };
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(1); const updated: any = await Lead.findById(prepared.lead._id);
    expect(updated).toMatchObject({ ...before, tags: expect.arrayContaining(['interes_venta_productos']) });
    const proposal: any = await AssistedProposal.findOne({ userId: ownerA }); expect(proposal).toMatchObject({ platform: 'whatsapp', status: 'proposed' });
    expect(proposal.text).not.toMatch(/ingresos? (?:garantizados?|asegurados?)|ganarás|resultado garantizado/i);
    expect(await Task.countDocuments({ userId: ownerA })).toBe(1); expect(await OutboundMessage.countDocuments({})).toBe(0); expect(await Meeting.countDocuments({})).toBe(0);
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('runs safely and idempotently on %s', async platform => {
    const prepared = await prepare(platform); const template: any = await AutomationService.ensureProductSalesTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AutomationEngineService.emit(prepared.event); await AutomationEngineService.emit(prepared.event);
    expect(await AutomationExecution.countDocuments({ automationId: template._id })).toBe(1); expect(await AssistedProposal.countDocuments({ userId: ownerA, platform })).toBe(1); expect(await Task.countDocuments({ userId: ownerA })).toBe(1);
    expect((await Lead.findById(prepared.lead._id))?.tags.filter(tag => tag === 'interes_venta_productos')).toHaveLength(1);
  });

  test('does not run another owner template', async () => {
    const prepared = await prepare('facebook'); const other: any = await AutomationService.ensureProductSalesTemplate(ownerB); await AutomationService.setStatus(other._id, ownerB, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0); expect(await AutomationExecution.countDocuments({ userId: ownerB })).toBe(0);
  });
});
