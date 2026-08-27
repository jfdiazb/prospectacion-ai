import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import Activity from '../src/models/Activity';
import QualificationHistory from '../src/models/QualificationHistory';
import AutomationFlow from '../src/models/AutomationFlow';
import AutomationExecution from '../src/models/AutomationExecution';
import { QualificationPolicyService } from '../src/services/QualificationPolicyService';
import { QualificationApplicationService } from '../src/services/QualificationApplicationService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
import { FollowUpPolicyService } from '../src/services/FollowUpService';

describe('Unified durable conversational qualification', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = process.env;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
  beforeEach(() => { process.env = { ...originalEnv, QUALIFICATION_WARM_SCORE: '50', QUALIFICATION_HOT_SCORE: '80', QUALIFICATION_INTERESTED_SCORE: '70', QUALIFICATION_DOWNGRADE_MARGIN: '10', QUALIFICATION_INTENT_HISTORY_LIMIT: '12' }; });
  afterEach(async () => { process.env = originalEnv; await Promise.all([Lead.deleteMany({}), Conversation.deleteMany({}), Activity.deleteMany({}), QualificationHistory.deleteMany({}), AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const evaluation = (score: number, normalizedIntent = 'undetermined', meetingIntent: 'none' | 'medium' | 'high' = 'none', intent = normalizedIntent === 'rejection' ? 'rejection' : meetingIntent === 'high' ? 'meeting' : 'interest') => ({ score, status: '', intent, normalizedIntent, tags: normalizedIntent === 'undetermined' ? [] : [`intent_${normalizedIntent}`], matchedPhrases: normalizedIntent === 'undetermined' ? [] : [normalizedIntent.replace(/_/g, ' ')], signals: { need: score, commercialExperience: 20, nutritionAffinity: 20, entrepreneurshipOpenness: score, interest: score, meetingIntent, rejectionReason: normalizedIntent === 'rejection' ? 'no_interesado' : undefined } });

  const prepare = async (platform: 'whatsapp' | 'instagram' | 'facebook' = 'whatsapp', overrides: any = {}) => {
    const userId = overrides.userId ?? new mongoose.Types.ObjectId();
    const lead: any = await Lead.create({ userId, username: `${platform}-${new mongoose.Types.ObjectId()}`, platform, status: 'new', interestLevel: 'cold', score: 0, normalizedIntents: [], ...overrides });
    const conversation: any = await Conversation.create({ userId, leadId: lead._id, messages: [], status: 'active' });
    return { userId, lead, conversation, platform };
  };

  const apply = (prepared: any, sourceEventId: string, value: any, extra: any = {}) => QualificationApplicationService.apply({ userId: prepared.userId.toString(), leadId: prepared.lead._id.toString(), conversationId: prepared.conversation._id.toString(), sourceEventId, platform: prepared.platform, source: `${prepared.platform}_test`, text: String(extra.text ?? value.normalizedIntent), isNewLead: Boolean(extra.isNewLead), commercialContextId: extra.commercialContextId, evaluation: value });

  test('uses one configurable source of truth for thresholds', () => {
    expect(QualificationPolicyService.temperature(49)).toBe('cold');
    expect(QualificationPolicyService.temperature(50)).toBe('warm');
    expect(QualificationPolicyService.temperature(79)).toBe('warm');
    expect(QualificationPolicyService.temperature(80)).toBe('hot');
    expect(QualificationPolicyService.status(69, 'interest', 'medium')).toBe('follow_up');
    expect(QualificationPolicyService.status(70, 'interest', 'medium')).toBe('interested');
  });

  test.each(['whatsapp', 'instagram', 'facebook'] as const)('applies the same thresholds and history on %s', async platform => {
    const prepared = await prepare(platform);
    const result = await apply(prepared, `${platform}-event`, evaluation(80, 'business_opportunity', 'medium'));
    expect(result.current).toMatchObject({ score: 80, interestLevel: 'hot', status: 'interested', normalizedIntent: 'business_opportunity' });
    expect(result.history).toMatchObject({ channel: platform, evaluatorVersion: QualificationPolicyService.version, scoreDelta: 80, processingState: 'completed' });
  });

  test('records cold to warm to hot and allows hysteretic legitimate regression', async () => {
    const prepared = await prepare();
    await apply(prepared, 'cold', evaluation(30));
    await apply(prepared, 'warm', evaluation(55, 'product_interest', 'medium'));
    await apply(prepared, 'hot', evaluation(85, 'business_opportunity', 'medium'));
    await apply(prepared, 'small-drop', evaluation(74, 'business_opportunity', 'medium'));
    expect(await Lead.findById(prepared.lead._id)).toMatchObject({ score: 74, interestLevel: 'hot' });
    const regressed = await apply(prepared, 'real-drop', evaluation(65, 'undetermined', 'none'));
    expect(regressed.current).toMatchObject({ score: 65, interestLevel: 'warm', status: 'follow_up' });
    expect(regressed.history).toMatchObject({ previous: { score: 74, interestLevel: 'hot' }, current: { score: 65, interestLevel: 'warm' }, scoreDelta: -9, reasons: expect.arrayContaining(['interest_score_decreased']) });
  });

  test('keeps explicit meeting separate from maximum score and high score separate from meeting', async () => {
    const meeting = await prepare();
    const meetingResult = await apply(meeting, 'meeting', evaluation(62, 'meeting', 'high', 'meeting'));
    expect(meetingResult.current).toMatchObject({ score: 62, interestLevel: 'warm', status: 'hot_prospect', qualification: { meetingIntent: 'high' } });
    const high = await prepare('instagram');
    const highResult = await apply(high, 'high-no-meeting', evaluation(90, 'business_opportunity', 'medium'));
    expect(highResult.current).toMatchObject({ score: 90, interestLevel: 'hot', status: 'interested', qualification: { meetingIntent: 'medium' } });
  });

  test('makes rejection and opt-out terminal with structured reasons and Automation 1 compatibility', async () => {
    const prepared = await prepare('whatsapp', { nextFollowUp: new Date(), followUp: { scheduledAt: new Date() } });
    const rejected = analyzeWhatsAppConversation(['No quiero continuar, deja de escribir']);
    const result = await apply(prepared, 'reject', rejected, { text: 'No quiero continuar' });
    expect(result.current).toMatchObject({ score: 0, status: 'rejected', interestLevel: 'cold', nextFollowUp: null, qualification: { meetingIntent: 'none' } });
    expect(result.history.reasons).toEqual(expect.arrayContaining(['rejection_or_opt_out', 'no_interesado']));
    expect(FollowUpPolicyService.isOptOut(result.current, { messages: [] })).toBe(true);
  });

  test('preserves bounded intent history across long conversations and context changes', async () => {
    const previousIntents = Array.from({ length: 11 }, (_, index) => `historic_${index}`);
    const prepared = await prepare('facebook', { normalizedIntents: previousIntents, qualification: { normalizedIntents: previousIntents } });
    const contextA = new mongoose.Types.ObjectId(); const contextB = new mongoose.Types.ObjectId();
    await apply(prepared, 'context-a', evaluation(55, 'product_interest', 'medium'), { commercialContextId: contextA });
    const result = await apply(prepared, 'context-b', evaluation(72, 'business_opportunity', 'medium'), { commercialContextId: contextB });
    expect(result.current.normalizedIntents).toHaveLength(12);
    expect(result.current.normalizedIntents).toEqual(expect.arrayContaining(['product_interest', 'business_opportunity']));
    expect(result.history.commercialContextId.toString()).toBe(contextB.toString());
  });

  test('records previous/current state, reasons, phrases, source and evaluator version', async () => {
    const prepared = await prepare('instagram', { score: 35, status: 'conversation_started', interestLevel: 'cold', normalizedIntent: 'undetermined' });
    const result = await apply(prepared, 'trace', evaluation(70, 'additional_income_interest', 'medium'));
    expect(result.history).toMatchObject({ sourceEventId: 'trace', channel: 'instagram', source: 'instagram_test', previous: { score: 35, status: 'conversation_started', interestLevel: 'cold' }, current: { score: 70, status: 'interested', interestLevel: 'warm' }, scoreDelta: 35, reasons: expect.arrayContaining(['additional_income_interest']), matchedPhrases: ['additional income interest'], evaluatorVersion: QualificationPolicyService.version });
    expect(await Activity.findOne({ leadId: prepared.lead._id, type: 'qualified' })).toMatchObject({ metadata: { scoreDelta: 35, evaluatorVersion: QualificationPolicyService.version } });
  });

  test('is idempotent for the same event and emits qualification context for automations', async () => {
    const prepared = await prepare();
    await AutomationFlow.create({ userId: prepared.userId, name: 'Cambio calificación', status: 'active', isActive: true, trigger: { type: 'lead.qualification_changed' }, actions: [{ type: 'add_tag', config: { tag: 'qualification-audited' } }] });
    const [first, second] = await Promise.all([apply(prepared, 'same-event', evaluation(75, 'business_opportunity', 'medium')), apply(prepared, 'same-event', evaluation(75, 'business_opportunity', 'medium'))]);
    expect([first.duplicate, second.duplicate]).toContain(true);
    expect(await QualificationHistory.countDocuments({ userId: prepared.userId, sourceEventId: 'same-event' })).toBe(1);
    expect(await AutomationExecution.countDocuments({ userId: prepared.userId, trigger: 'lead.qualification_changed' })).toBe(1);
    expect((await Lead.findById(prepared.lead._id))?.tags).toContain('qualification-audited');
  });

  test('serializes simultaneous distinct events and isolates owners', async () => {
    const ownerA = await prepare('whatsapp'); const ownerB = await prepare('whatsapp');
    await Promise.all([apply(ownerA, 'a-1', evaluation(55, 'product_interest', 'medium')), apply(ownerA, 'a-2', evaluation(82, 'business_opportunity', 'medium')), apply(ownerB, 'b-1', evaluation(30))]);
    expect(await QualificationHistory.countDocuments({ userId: ownerA.userId })).toBe(2);
    expect(await QualificationHistory.countDocuments({ userId: ownerB.userId })).toBe(1);
    expect((await Lead.findById(ownerB.lead._id))?.score).toBe(30);
  });

  test('preserves presentation_sent without inventing presentation automation', async () => {
    const prepared = await prepare('whatsapp', { status: 'presentation_sent', score: 70, interestLevel: 'warm' });
    const result = await apply(prepared, 'presentation', evaluation(72, 'business_opportunity', 'medium'));
    expect(result.current.status).toBe('presentation_sent');
  });
});
