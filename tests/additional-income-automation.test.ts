import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AutomationFlow from '../src/models/AutomationFlow';
import AutomationExecution from '../src/models/AutomationExecution';
import AssistedProposal from '../src/models/AssistedProposal';
import CommercialContext from '../src/models/CommercialContext';
import Conversation from '../src/models/Conversation';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import Task from '../src/models/Task';
import { AutomationService } from '../src/services/AutomationService';
import { AutomationEngineService, type AutomationEvent } from '../src/services/AutomationEngineService';
import { CommercialContextService } from '../src/services/CommercialContextService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';

describe('Ingresos adicionales → Calificación asistida', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); process.env.AI_MODE = 'mock'; });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => Promise.all([AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({}), AssistedProposal.deleteMany({}), CommercialContext.deleteMany({}), Conversation.deleteMany({}), Lead.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({})]));
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook', text = 'Estoy buscando una forma de generar ingresos adicionales.') => {
    const context: any = await CommercialContextService.getActive(ownerA);
    const qualification = analyzeWhatsAppConversation([text], context);
    const lead: any = await Lead.create({ userId: ownerA, username: `${platform}-lead`, platform, status: qualification.status, score: qualification.score, interestLevel: 'warm', tags: qualification.tags, commercialContextId: context._id, normalizedIntent: qualification.normalizedIntent, normalizedIntents: [qualification.normalizedIntent], qualification: { intent: qualification.intent, normalizedIntent: qualification.normalizedIntent, meetingIntent: qualification.signals.meetingIntent } });
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: lead._id });
    const recipient = platform === 'whatsapp' ? { type: 'whatsapp_user', externalId: '+573001112233' } : platform === 'instagram' ? { type: 'instagram_user', externalId: 'ig-user' } : { type: 'facebook_user', externalId: 'fb-user' };
    const event: AutomationEvent = { eventId: `event-${platform}-${new mongoose.Types.ObjectId()}`, trigger: 'message.received', userId: ownerA, leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform, source: `${platform}_test`, text, recipient, data: { score: qualification.score, status: qualification.status, tags: qualification.tags, normalizedIntent: qualification.normalizedIntent, commercialContextId: context._id.toString(), meetingIntent: qualification.signals.meetingIntent } };
    return { context, qualification, lead, conversation, event };
  };

  test('creates one editable inactive template with semantic conditions and no score/status/meeting action', async () => {
    const first: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); const second: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA);
    expect(first._id.toString()).toBe(second._id.toString()); expect(first).toMatchObject({ name: 'Ingresos adicionales → Calificación asistida', status: 'draft', isActive: false, trigger: { type: 'message.received' } });
    expect(first.conditions).toEqual(expect.arrayContaining([expect.objectContaining({ field: 'normalizedIntent', value: 'additional_income_interest' }), expect.objectContaining({ field: 'commercialContextId', operator: 'exists' })]));
    expect(first.actions.map((item: any) => item.type)).toEqual(['add_tag', 'generate_ai_response', 'suggest_followup']);
    expect(first.actions.map((item: any) => item.type)).not.toEqual(expect.arrayContaining(['update_score', 'change_status', 'mark_meeting_candidate']));
  });

  test.each(['Busco ingresos extra.', 'Quiero generar un ingreso adicional.', 'Me gustaría tener una segunda fuente de ingresos.', 'Estoy buscando algo para hacer en mi tiempo libre y ganar un ingreso extra.'])('normalizes a positive variation: %s', async text => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation([text], context).normalizedIntent).toBe('additional_income_interest');
  });

  test('creates a proposal and follow-up without delivery or artificial scoring', async () => {
    const prepared = await prepare('whatsapp'); const template: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active'); const originalScore = prepared.lead.score;
    const results = await AutomationEngineService.emit(prepared.event); expect(results).toHaveLength(1);
    expect(await Lead.findById(prepared.lead._id)).toMatchObject({ score: originalScore, tags: expect.arrayContaining(['interes_ingresos_adicionales']) });
    expect(await AssistedProposal.findOne({ userId: ownerA })).toMatchObject({ platform: 'whatsapp', status: 'proposed' });
    expect(await Task.countDocuments({ userId: ownerA, status: 'pending' })).toBe(1); expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('is eligible on %s', async platform => {
    const prepared = await prepare(platform); const template: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(1); expect(await AssistedProposal.findOne({ userId: ownerA, platform })).toMatchObject({ status: 'proposed' });
  });

  test.each([['No me interesa', 'rejection'], ['Hablemos del clima', 'undetermined'], ['Quiero comprar productos', 'product_interest']] as const)('does not execute for %s', async (text, intent) => {
    const prepared = await prepare('instagram', text); const template: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    expect(prepared.qualification.normalizedIntent).toBe(intent); expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0);
  });

  test('is idempotent for execution, proposal and semantic tag', async () => {
    const prepared = await prepare('facebook'); const template: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    await AutomationEngineService.emit(prepared.event); await AutomationEngineService.emit(prepared.event);
    expect(await AutomationExecution.countDocuments({ automationId: template._id })).toBe(1); expect(await AssistedProposal.countDocuments({ userId: ownerA })).toBe(1);
    expect((await Lead.findById(prepared.lead._id))?.tags.filter(tag => tag === 'interes_ingresos_adicionales')).toHaveLength(1);
  });

  test('isolates template and execution by owner', async () => {
    const prepared = await prepare('whatsapp'); const other: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerB); await AutomationService.setStatus(other._id, ownerB, 'active');
    expect(await AutomationEngineService.emit(prepared.event)).toHaveLength(0); expect(await AutomationExecution.countDocuments({ userId: ownerB })).toBe(0);
  });

  test('does not start without a valid lead identifier or with an incompatible state', async () => {
    const prepared = await prepare('whatsapp'); const template: any = await AutomationService.ensureAdditionalIncomeTemplate(ownerA); await AutomationService.setStatus(template._id, ownerA, 'active');
    expect(await AutomationEngineService.emit({ ...prepared.event, leadId: undefined })).toHaveLength(0);
    await Lead.updateOne({ _id: prepared.lead._id }, { $set: { status: 'registered' } });
    expect(await AutomationEngineService.emit({ ...prepared.event, eventId: 'registered-event', data: { ...prepared.event.data, status: 'registered' } })).toHaveLength(0);
  });

  test('conversation can evolve to business opportunity without meeting intent high', async () => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation(['Estoy buscando una forma de generar ingresos adicionales.', 'Sí, quisiera conocer una oportunidad que pueda desarrollar en mi tiempo libre.'], context);
    expect(result.normalizedIntent).toBe('business_opportunity'); expect(result.signals.meetingIntent).not.toBe('high');
  });
});
