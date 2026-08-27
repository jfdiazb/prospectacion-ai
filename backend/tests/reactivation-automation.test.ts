import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import Task from '../src/models/Task';
import Meeting from '../src/models/Meeting';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import QualificationHistory from '../src/models/QualificationHistory';
import { ConversationService } from '../src/services/ConversationService';
import { ReactivationPolicyService, ReactivationService } from '../src/services/ReactivationService';

describe('Durable assisted lead reactivation', () => {
  let mongo: MongoMemoryServer;
  const now = new Date('2027-03-20T15:00:00.000Z');
  const old = new Date(now.getTime() - 20 * 86400000);
  const originalEnv = process.env;

  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
  beforeEach(() => { process.env = { ...originalEnv, AI_MODE: 'mock', REACTIVATION_INACTIVITY_MS: String(14 * 86400000), REACTIVATION_COOLDOWN_MS: String(30 * 86400000), REACTIVATION_MAX_ATTEMPTS: '2', REACTIVATION_PROPOSAL_TTL_MS: String(7 * 86400000), META_MESSAGING_MODE: 'mock', WHATSAPP_MESSAGING_MODE: 'mock' }; });
  afterEach(async () => { process.env = originalEnv; await Promise.all([Lead.deleteMany({}), Conversation.deleteMany({}), Task.deleteMany({}), Meeting.deleteMany({}), AssistedProposal.deleteMany({}), OutboundMessage.deleteMany({}), QualificationHistory.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (leadOverrides: any = {}, conversationOverrides: any = {}) => {
    const userId = leadOverrides.userId ?? new mongoose.Types.ObjectId();
    const platform = leadOverrides.platform ?? 'whatsapp';
    const lead: any = await Lead.create({ userId, username: leadOverrides.username ?? `${platform}-person`, phone: platform === 'whatsapp' ? '573001234567' : undefined,
      platform, currentChannel: platform, status: 'follow_up', interestLevel: 'warm', score: 68, lastContact: old,
      normalizedIntent: 'business_opportunity', normalizedIntents: ['business_opportunity'], qualification: { intent: 'interest', normalizedIntent: 'business_opportunity', meetingIntent: 'medium', lastEvaluatedAt: old }, ...leadOverrides });
    const conversation: any = await Conversation.create({ userId, leadId: lead._id, status: 'active', controlMode: 'automated', lastMessage: old, messages: [
      { sender: 'lead', text: 'Quiero entender cómo funciona la oportunidad para generar otros ingresos', platform, timestamp: new Date(old.getTime() - 1000) },
      { sender: 'ai', text: 'Claro, podemos revisar el modelo y tus objetivos.', platform, direction: 'outbound', status: 'sent', timestamp: old },
    ], ...conversationOverrides });
    await QualificationHistory.create({ userId, leadId: lead._id, conversationId: conversation._id, sourceEventId: `qualification:${lead._id}`, channel: platform, source: 'test', evaluatorVersion: 'conversation-qualification-v2', processingState: 'completed', current: { score: lead.score, status: lead.status, interestLevel: lead.interestLevel, normalizedIntent: lead.normalizedIntent }, evaluatedAt: old });
    return { userId, lead, conversation };
  };

  test('detects real inactivity and creates one contextual assisted proposal and task without outbound delivery', async () => {
    const { lead } = await prepare();
    expect(await ReactivationService.processInactiveLeads(20, now)).toBe(1);
    const updated: any = await Lead.findById(lead._id);
    expect(updated.reactivation).toMatchObject({ attempts: 1, lastDecision: 'proposed' });
    const proposal: any = await AssistedProposal.findOne({ leadId: lead._id });
    expect(proposal).toMatchObject({ purpose: 'reactivation', status: 'proposed', platform: 'whatsapp', recipient: { type: 'whatsapp_user', externalId: '573001234567' } });
    expect(proposal.text).toContain('oportunidad');
    expect(proposal.text).not.toMatch(/¿sigues interesado/i);
    expect(await Task.findOne({ leadId: lead._id, status: 'pending' })).toMatchObject({ metadata: { followUpPurpose: 'lead_reactivation', suggestedOnly: true } });
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('does not detect a lead with recent activity', async () => {
    await prepare({ lastContact: new Date(now.getTime() - 2 * 86400000) }, { lastMessage: new Date(now.getTime() - 2 * 86400000) });
    expect(await ReactivationService.processInactiveLeads(20, now)).toBe(0);
    expect(await AssistedProposal.countDocuments({})).toBe(0);
  });

  test.each([
    ['rejected', { status: 'rejected' }, {}, 'opt_out_or_rejected'],
    ['opt-out tag', { tags: ['no_contactar'] }, {}, 'opt_out_or_rejected'],
    ['opt-out text', {}, { messages: [{ sender: 'lead', text: 'No quiero continuar, no me contactes', platform: 'whatsapp', timestamp: new Date(old.getTime() - 1000) }, { sender: 'ai', text: 'Entendido', platform: 'whatsapp', timestamp: old }] }, 'opt_out_or_rejected'],
    ['closed conversation', {}, { status: 'closed' }, 'conversation_closed'],
    ['human control', {}, { controlMode: 'human_controlled' }, 'human_controlled'],
  ])('excludes %s', async (_label, leadOverrides, conversationOverrides, reason) => {
    const { lead } = await prepare(leadOverrides, conversationOverrides);
    await ReactivationService.processInactiveLeads(20, now);
    expect(await Lead.findById(lead._id)).toMatchObject({ reactivation: { lastDecision: 'excluded', lastReason: reason, attempts: 0 } });
    expect(await AssistedProposal.countDocuments({})).toBe(0);
  });

  test('excludes an active meeting', async () => {
    const { userId, lead, conversation } = await prepare();
    await Meeting.create({ userId, leadId: lead._id, conversationId: conversation._id, status: 'confirmed', scheduledFor: new Date(now.getTime() + 86400000) });
    await ReactivationService.processInactiveLeads(20, now);
    expect(await Lead.findById(lead._id)).toMatchObject({ reactivation: { lastReason: 'active_meeting', attempts: 0 } });
  });

  test('respects cooldown and maximum attempts', async () => {
    const cooling = await prepare({ username: 'cooling', reactivation: { attempts: 1, nextEligibleAt: new Date(now.getTime() + 86400000) } });
    const maxed = await prepare({ username: 'maxed', reactivation: { attempts: 2 } });
    expect(await ReactivationService.processInactiveLeads(20, now)).toBe(0);
    expect((await Lead.findById(cooling.lead._id) as any).reactivation.attempts).toBe(1);
    expect((await Lead.findById(maxed.lead._id) as any).reactivation.attempts).toBe(2);
  });

  test('does not repeat a previous response or a question already asked', async () => {
    const repeated = 'Retomo tu interés anterior en conocer la oportunidad y sus opciones. Si aún es un buen momento, podemos continuar exactamente desde el punto donde quedó la conversación.';
    const { lead } = await prepare({}, { aiAskedTopics: ['desired_outcome'], aiResponseFingerprints: [ConversationService.fingerprintAIText(repeated)], messages: [
      { sender: 'lead', text: 'Quiero conocer la oportunidad', platform: 'whatsapp', timestamp: new Date(old.getTime() - 2000) },
      { sender: 'ai', text: '¿Qué resultado buscas conseguir?', platform: 'whatsapp', timestamp: new Date(old.getTime() - 1000) },
      { sender: 'ai', text: repeated, platform: 'whatsapp', timestamp: old },
    ] });
    await ReactivationService.processInactiveLeads(20, now);
    const proposal: any = await AssistedProposal.findOne({ leadId: lead._id });
    expect(proposal.text).not.toBe(repeated);
    expect(proposal.text).not.toMatch(/qué resultado buscas/i);
  });

  test('expires a proposal immediately when the prospect replies', async () => {
    const { userId, lead, conversation } = await prepare();
    await ReactivationService.processInactiveLeads(20, now);
    await ConversationService.addMessage(conversation._id.toString(), userId.toString(), { sender: 'lead', text: 'Ahora sí, continuemos', platform: 'whatsapp' });
    expect(await AssistedProposal.findOne({ leadId: lead._id })).toMatchObject({ status: 'cancelled', invalidationReason: 'prospect_replied' });
    expect(await Task.findOne({ leadId: lead._id })).toMatchObject({ status: 'cancelled', metadata: { cancelReason: 'prospect_replied' } });
  });

  test('rejects an expired proposal and context changes between detection and approval', async () => {
    const { lead, conversation } = await prepare();
    await ReactivationService.processInactiveLeads(20, now);
    const proposal: any = await AssistedProposal.findOne({ leadId: lead._id });
    expect((await ReactivationService.validateProposal(proposal, new Date(now.getTime() + 8 * 86400000))).reason).toBe('proposal_expired');
    await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: new Date(now.getTime() + 1000) } });
    expect((await ReactivationService.validateProposal(proposal, now)).reason).toBe('conversation_changed');
  });

  test('the durable worker automatically expires stale proposals without opening CRM', async () => {
    const { lead } = await prepare();
    await ReactivationService.processInactiveLeads(20, now);
    expect(await ReactivationService.reconcileOpenProposals(new Date(now.getTime() + 8 * 86400000))).toBe(1);
    expect(await AssistedProposal.findOne({ leadId: lead._id })).toMatchObject({ status: 'cancelled', invalidationReason: 'proposal_expired' });
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('rejects a proposal when lead status or channel changes', async () => {
    const { lead } = await prepare();
    await ReactivationService.processInactiveLeads(20, now);
    const proposal: any = await AssistedProposal.findOne({ leadId: lead._id });
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'interested' } });
    expect((await ReactivationService.validateProposal(proposal, now)).reason).toBe('lead_status_changed');
    await Lead.updateOne({ _id: lead._id }, { $set: { status: 'follow_up', currentChannel: 'instagram' } });
    expect((await ReactivationService.validateProposal(proposal, now)).reason).toBe('channel_changed');
  });

  test('is idempotent and only one of two concurrent workers claims the conversation', async () => {
    const { lead } = await prepare();
    const results = await Promise.all([ReactivationService.processInactiveLeads(1, now), ReactivationService.processInactiveLeads(1, now)]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(await AssistedProposal.countDocuments({ leadId: lead._id })).toBe(1);
    expect((await Lead.findById(lead._id) as any).reactivation.attempts).toBe(1);
    expect(await ReactivationService.processInactiveLeads(20, now)).toBe(0);
  });

  test('isolates owners and preserves Instagram and Facebook recipients', async () => {
    const instagram = await prepare({ platform: 'instagram', username: 'ig-scoped' });
    const facebook = await prepare({ platform: 'facebook', username: 'page-scoped' });
    await ReactivationService.processInactiveLeads(20, now);
    expect(await AssistedProposal.findOne({ userId: instagram.userId })).toMatchObject({ platform: 'instagram', recipient: { type: 'instagram_user', externalId: 'ig-scoped' } });
    expect(await AssistedProposal.findOne({ userId: facebook.userId })).toMatchObject({ platform: 'facebook', recipient: { type: 'facebook_user', externalId: 'page-scoped' } });
  });

  test('creates task-only assistance for YouTube and never guesses a recipient or sends', async () => {
    const { lead } = await prepare({ platform: 'youtube', username: 'channel-id' });
    await ReactivationService.processInactiveLeads(20, now);
    expect(await Lead.findById(lead._id)).toMatchObject({ reactivation: { lastDecision: 'task_only', attempts: 1 } });
    expect(await Task.findOne({ leadId: lead._id })).not.toBeNull();
    expect(await AssistedProposal.countDocuments({})).toBe(0);
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('policy uses qualification and conversation facts without changing Automation 1 or 3 fields', async () => {
    const { lead, conversation } = await prepare();
    const decision = await ReactivationPolicyService.evaluate(lead, conversation, now);
    expect(decision.eligible).toBe(true);
    await ReactivationService.processInactiveLeads(20, now);
    const unchanged: any = await Lead.findById(lead._id);
    expect(unchanged).toMatchObject({ score: 68, interestLevel: 'warm', status: 'follow_up', normalizedIntent: 'business_opportunity' });
    expect(unchanged.followUp?.attempts || 0).toBe(0);
  });
});
