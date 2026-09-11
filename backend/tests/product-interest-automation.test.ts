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

describe('Interés en productos → Calificación de consumo asistida', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); process.env.AI_MODE = 'mock'; });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => Promise.all([AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({}), AssistedProposal.deleteMany({}), CommercialContext.deleteMany({}), Conversation.deleteMany({}), Lead.deleteMany({}), Meeting.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({})]));
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook', text = 'Quiero conocer los productos.') => {
    const context: any = await CommercialContextService.getActive(ownerA); const qualification = analyzeWhatsAppConversation([text], context);
    const lead: any = await Lead.create({ userId: ownerA, username: `${platform}-${new mongoose.Types.ObjectId()}`, platform, status: qualification.status, score: qualification.score, interestLevel: qualification.score >= 50 ? 'warm' : 'cold', tags: qualification.tags, commercialContextId: context._id, normalizedIntent: qualification.normalizedIntent, normalizedIntents: [qualification.normalizedIntent], qualification: { intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, meetingIntent: qualification.signals.meetingIntent } });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    const recipient = platform === 'whatsapp' ? { type: 'whatsapp_user', externalId: '+573001112233' } : platform === 'instagram' ? { type: 'instagram_user', externalId: 'ig-user' } : { type: 'facebook_user', externalId: 'fb-user' };
    const event: AutomationEvent = { eventId: `product-${platform}-${new mongoose.Types.ObjectId()}`, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform, source: `${platform}_test`, text, recipient, data: { score: qualification.score, status: qualification.status, tags: qualification.tags, normalizedIntent: qualification.normalizedIntent, commercialContextId: context._id.toString(), meetingIntent: qualification.signals.meetingIntent } };
    return { context, qualification, lead, event };
  };

  test('materializes one owner-scoped inactive template with only assisted actions', async () => {
    const first: any = await AutomationService.ensureProductInterestTemplate(ownerA); const second: any = await AutomationService.ensureProductInterestTemplate(ownerA); const other: any = await AutomationService.ensureProductInterestTemplate(ownerB);
    expect(first._id.toString()).toBe(second._id.toString()); expect(other._id.toString()).not.toBe(first._id.toString());
    expect(first).toMatchObject({ name: 'Interés en productos → Calificación de consumo asistida', status: 'draft', isActive: false, trigger: { type: 'message.received' } });
    expect(first.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'normalizedIntent', value: 'product_interest' }), expect.objectContaining({ field: 'leadId', operator: 'exists' })]));
    expect(first.actions.map((item: any) => item.type)).toEqual(['add_tag', 'generate_ai_response', 'suggest_followup']);
    expect(first.actions.map((item: any) => item.type)).not.toEqual(expect.arrayContaining(['update_score', 'change_status', 'mark_meeting_candidate']));
  });

  test.each(['Quiero conocer los productos.', 'Estoy interesado en comprar un producto.', 'Quiero conocer opciones para uso personal.', 'Quiero conocer Nutrilite.'])('classifies consumption without assuming business: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('product_interest'); expect(result.tags).toContain('interes_productos'); expect(result.tags).not.toEqual(expect.arrayContaining(['interes_oportunidad_negocio', 'interes_venta_productos'])); expect(result.signals.meetingIntent).not.toBe('high');
  });

  test.each(['Quiero vender los productos.', '¿Puedo ganar dinero vendiendo estos productos?'])('does not classify sales as simple consumption: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation([text], context).normalizedIntent).toBe('product_sales_interest');
  });

  test.each(['Me interesan los productos y también quisiera conocer el negocio.', 'Quiero usarlos pero también saber si puedo venderlos.'])('recognizes combined signals: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(['business_and_product_interest', 'product_sales_interest']).toContain(result.normalizedIntent); expect(result.normalizedIntent).not.toBe('product_interest');
  });

  test.each(['No me interesa.', 'No gracias.', 'No quiero continuar.'])('respects rejection: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([text], context);
    expect(result.normalizedIntent).toBe('rejection'); expect(result.status).toBe('rejected');
  });

  test('creates a proposed CRM response and one task without delivery, meeting, score or state mutation', async () => {
    const prepared = await prepare('whatsapp'); const template: any = await AutomationService.ensureProductInterestTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); const before = { score: prepared.lead.score, status: prepared.lead.status };
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(1); expect(await Lead.findById(prepared.lead._id)).toMatchObject({ ...before, tags: expect.arrayContaining(['interes_productos']) });
    expect(await AssistedProposal.findOne({ userId: ownerA })).toMatchObject({ platform: 'whatsapp', status: 'proposed' }); expect(await Task.countDocuments({ userId: ownerA })).toBe(1);
    expect(await OutboundMessage.countDocuments({})).toBe(0); expect(await Meeting.countDocuments({})).toBe(0);
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('runs safely on %s', async platform => {
    const prepared = await prepare(platform); const template: any = await AutomationService.ensureProductInterestTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(1); expect(await AssistedProposal.findOne({ userId: ownerA, platform })).toMatchObject({ status: 'proposed' });
  });

  test.each(['Quiero vender los productos.', 'Quiero conocer una oportunidad de negocio.', 'No me interesa.'])('does not execute the consumption flow for %s', async text => {
    const prepared = await prepare('instagram', text); const template: any = await AutomationService.ensureProductInterestTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0);
  });

  test('is idempotent for execution, tag, proposal and task', async () => {
    const prepared = await prepare('facebook'); const template: any = await AutomationService.ensureProductInterestTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AutomationEngineService.emit(prepared.event); await AutomationEngineService.emit(prepared.event);
    expect(await AutomationExecution.countDocuments({ automationId: template._id })).toBe(1); expect(await AssistedProposal.countDocuments({ userId: ownerA })).toBe(1); expect(await Task.countDocuments({ userId: ownerA })).toBe(1);
    expect((await Lead.findById(prepared.lead._id))?.tags.filter(tag => tag === 'interes_productos')).toHaveLength(1);
  });

  test('does not run another owner template', async () => {
    const prepared = await prepare('whatsapp'); const other: any = await AutomationService.ensureProductInterestTemplate(ownerB); await AutomationService.setStatus(other._id, ownerB, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0); expect(await AutomationExecution.countDocuments({ userId: ownerB })).toBe(0);
  });

  test('conversation evolves from consumption to sales without meeting intent high', async () => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation(['Quiero conocer los productos.', 'Pero también quisiera saber si podría venderlos.'], context);
    expect(result.normalizedIntent).toBe('product_sales_interest'); expect(result.signals.meetingIntent).not.toBe('high');
  });
});
