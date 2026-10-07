import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AssistedProposal from '../src/models/AssistedProposal';
import AutomationExecution from '../src/models/AutomationExecution';
import AutomationFlow from '../src/models/AutomationFlow';
import AutomationJob from '../src/models/AutomationJob';
import CommercialContext from '../src/models/CommercialContext';
import Conversation from '../src/models/Conversation';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import Task from '../src/models/Task';
import { AutomationEngineService, type AutomationEvent } from '../src/services/AutomationEngineService';
import { AutomationService } from '../src/services/AutomationService';
import { CommercialContextService } from '../src/services/CommercialContextService';

describe('ALMA go-live final automation configuration', () => {
  let mongo: MongoMemoryServer;
  let ownerId: string;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    process.env.AI_MODE = 'mock';
  });

  beforeEach(async () => {
    ownerId = new mongoose.Types.ObjectId().toString();
    const templates: any[] = await Promise.all([
      AutomationService.ensureInfoTemplate(ownerId),
      AutomationService.ensureAdditionalIncomeTemplate(ownerId),
      AutomationService.ensureProductInterestTemplate(ownerId),
      AutomationService.ensureProductSalesTemplate(ownerId),
      AutomationService.ensureBusinessOpportunityTemplate(ownerId),
      AutomationService.ensureBusinessProductTemplate(ownerId),
    ]);
    await Promise.all(templates.map(template => AutomationService.setStatus(template._id, ownerId, 'active')));
  });

  afterEach(async () => Promise.all([
    AssistedProposal.deleteMany({}),
    AutomationExecution.deleteMany({}),
    AutomationFlow.deleteMany({}),
    AutomationJob.deleteMany({}),
    CommercialContext.deleteMany({}),
    Conversation.deleteMany({}),
    Lead.deleteMany({}),
    OutboundMessage.deleteMany({}),
    Task.deleteMany({}),
  ]));

  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  const prepareEvent = async (trigger: 'keyword.detected' | 'message.received', normalizedIntent?: string) => {
    const context: any = await CommercialContextService.getActive(ownerId);
    const lead: any = await Lead.create({
      userId: ownerId,
      username: `go-live-${new mongoose.Types.ObjectId()}`,
      platform: 'whatsapp',
      status: 'new',
      score: 0,
      interestLevel: 'cold',
      tags: [],
      commercialContextId: context._id,
      normalizedIntent,
      normalizedIntents: normalizedIntent ? [normalizedIntent] : [],
    });
    const conversation: any = await Conversation.create({ userId: ownerId, leadId: lead._id });
    const event: AutomationEvent = {
      eventId: `go-live-${new mongoose.Types.ObjectId()}`,
      trigger,
      userId: ownerId,
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      platform: 'whatsapp',
      text: trigger === 'keyword.detected' ? 'INFO' : 'Mensaje comercial de prueba',
      recipient: { type: 'whatsapp_user', externalId: '+573001112233' },
      data: {
        score: 0,
        status: 'new',
        tags: [],
        normalizedIntent,
        commercialContextId: context._id.toString(),
        meetingIntent: 'low',
      },
    };
    return { lead, event };
  };

  test('INFO qualifies before the 24h wait and resumes only the follow-up', async () => {
    const info: any = await AutomationFlow.findOne({ userId: ownerId, templateKey: 'info_qualification_v1' });
    expect(info.actions.map((action: any) => action.type)).toEqual([
      'add_tag', 'generate_ai_response', 'update_score', 'change_status', 'wait', 'suggest_followup',
    ]);
    expect(info.actions[4].config.durationMs).toBe(86400000);

    const { lead, event } = await prepareEvent('keyword.detected');
    const first = await AutomationEngineService.emit(event);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ status: 'waiting' });
    expect(await Lead.findById(lead._id)).toMatchObject({
      score: 65,
      status: 'interested',
      tags: expect.arrayContaining(['INFO']),
    });
    expect(await AssistedProposal.countDocuments({ userId: ownerId })).toBe(1);
    expect(await Task.countDocuments({ userId: ownerId })).toBe(0);
    expect(await AutomationExecution.countDocuments({ userId: ownerId })).toBe(1);

    const job: any = await AutomationJob.findOne({ executionId: first[0]._id });
    expect(job).toMatchObject({ status: 'pending', resumeStep: 5 });
    expect(job.runAt.getTime()).toBeGreaterThan(Date.now());
    await AutomationJob.updateOne({ _id: job._id }, { $set: { runAt: new Date(0) } });
    expect(await AutomationEngineService.processDueJobs()).toBe(1);
    expect(await AutomationExecution.findById(first[0]._id)).toMatchObject({ status: 'completed' });
    expect(await Task.countDocuments({ userId: ownerId, status: 'pending' })).toBe(1);

    await AutomationEngineService.emit(event);
    expect(await AutomationExecution.countDocuments({ userId: ownerId })).toBe(1);
    expect(await AssistedProposal.countDocuments({ userId: ownerId })).toBe(1);
    expect(await Task.countDocuments({ userId: ownerId })).toBe(1);
  });

  test.each([
    ['additional_income_assisted_qualification_v1', 'additional_income_interest', 'interes_ingresos_adicionales'],
    ['product_interest_assisted_qualification_v1', 'product_interest', 'interes_productos'],
    ['product_sales_interest_assisted_qualification_v1', 'product_sales_interest', 'interes_venta_productos'],
    ['business_opportunity_assisted_qualification_v1', 'business_opportunity', 'interes_oportunidad_negocio'],
    ['business_product_assisted_qualification_v1', 'business_and_product_interest', 'interes_negocio_y_productos'],
  ])('%s is isolated, idempotent and assisted-only', async (templateKey, normalizedIntent, expectedTag) => {
    const { lead, event } = await prepareEvent('message.received', normalizedIntent);
    await AutomationEngineService.emit(event);
    await AutomationEngineService.emit(event);

    const execution: any = await AutomationExecution.findOne({ userId: ownerId });
    const expectedFlow: any = await AutomationFlow.findOne({ userId: ownerId, templateKey });
    expect(await AutomationExecution.countDocuments({ userId: ownerId })).toBe(1);
    expect(execution.automationId.toString()).toBe(expectedFlow._id.toString());
    expect(await Lead.findById(lead._id)).toMatchObject({ tags: expect.arrayContaining([expectedTag]) });
    expect(await AssistedProposal.countDocuments({ userId: ownerId, status: 'proposed' })).toBe(1);
    expect(await Task.countDocuments({ userId: ownerId, status: 'pending' })).toBe(1);
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('all six active configurations produce zero outbound messages', async () => {
    expect(await AutomationFlow.countDocuments({ userId: ownerId, status: 'active' })).toBe(6);
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('all six templates preserve their contractual triggers, intents and action order', async () => {
    const expected = [
      {
        templateKey: 'info_qualification_v1',
        trigger: 'keyword.detected',
        keyword: 'INFO',
        intent: undefined,
        actions: ['add_tag', 'generate_ai_response', 'update_score', 'change_status', 'wait', 'suggest_followup'],
      },
      {
        templateKey: 'additional_income_assisted_qualification_v1',
        trigger: 'message.received',
        intent: 'additional_income_interest',
        actions: ['add_tag', 'generate_ai_response', 'suggest_followup'],
      },
      {
        templateKey: 'product_interest_assisted_qualification_v1',
        trigger: 'message.received',
        intent: 'product_interest',
        actions: ['add_tag', 'generate_ai_response', 'suggest_followup'],
      },
      {
        templateKey: 'product_sales_interest_assisted_qualification_v1',
        trigger: 'message.received',
        intent: 'product_sales_interest',
        actions: ['add_tag', 'generate_ai_response', 'suggest_followup'],
      },
      {
        templateKey: 'business_opportunity_assisted_qualification_v1',
        trigger: 'message.received',
        intent: 'business_opportunity',
        actions: ['add_tag', 'generate_ai_response', 'suggest_followup'],
      },
      {
        templateKey: 'business_product_assisted_qualification_v1',
        trigger: 'message.received',
        intent: 'business_and_product_interest',
        actions: ['add_tag', 'generate_ai_response', 'suggest_followup'],
      },
    ];

    for (const contract of expected) {
      const flow: any = await AutomationFlow.findOne({ userId: ownerId, templateKey: contract.templateKey });
      expect(flow.trigger.type).toBe(contract.trigger);
      expect(flow.trigger.keyword).toBe(contract.keyword);
      expect(flow.actions.map((action: any) => action.type)).toEqual(contract.actions);
      const intentCondition = flow.conditions.find((condition: any) => condition.field === 'normalizedIntent');
      expect(intentCondition?.value).toBe(contract.intent);
    }
  });

  test('materializing every template repeatedly reuses exactly the same six flows', async () => {
    const before: any[] = await AutomationFlow.find({ userId: ownerId }).sort({ templateKey: 1 });
    const repeated: any[] = await Promise.all([
      AutomationService.ensureInfoTemplate(ownerId),
      AutomationService.ensureAdditionalIncomeTemplate(ownerId),
      AutomationService.ensureProductInterestTemplate(ownerId),
      AutomationService.ensureProductSalesTemplate(ownerId),
      AutomationService.ensureBusinessOpportunityTemplate(ownerId),
      AutomationService.ensureBusinessProductTemplate(ownerId),
    ]);
    const after: any[] = await AutomationFlow.find({ userId: ownerId }).sort({ templateKey: 1 });

    expect(after).toHaveLength(6);
    expect(after.map(flow => flow._id.toString())).toEqual(before.map(flow => flow._id.toString()));
    expect(repeated.map(flow => flow._id.toString()).sort()).toEqual(before.map(flow => flow._id.toString()).sort());
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });
});
