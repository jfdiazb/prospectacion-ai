import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Meeting from '../src/models/Meeting';
import MeetingAction from '../src/models/MeetingAction';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import Task from '../src/models/Task';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import AutomationFlow from '../src/models/AutomationFlow';
import AutomationExecution from '../src/models/AutomationExecution';
import { MeetingAutomationService } from '../src/services/MeetingAutomationService';
import { MeetingLifecycleService } from '../src/services/MeetingLifecycleService';

describe('Durable assisted meeting automation', () => {
  let mongo: MongoMemoryServer;
  const now = new Date('2027-06-10T15:00:00.000Z');
  const originalEnv = process.env;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
  beforeEach(() => { process.env = { ...originalEnv, AI_MODE: 'mock', MEETING_REMINDER_WINDOWS_MINUTES: '1440,60', MEETING_REMINDER_MIN_LEAD_MINUTES: '10', MEETING_POST_FOLLOWUP_DELAY_MS: '0', MEETING_PROPOSAL_TTL_MS: '86400000', MEETING_OUTCOME_REVIEW_GRACE_MS: '3600000', META_MESSAGING_MODE: 'mock', WHATSAPP_MESSAGING_MODE: 'mock', ZOOM_MODE: 'mock', SCHEDULING_MODE: 'zoom' }; });
  afterEach(async () => { process.env = originalEnv; await Promise.all([Meeting.deleteMany({}), MeetingAction.deleteMany({}), Lead.deleteMany({}), Conversation.deleteMany({}), Task.deleteMany({}), AssistedProposal.deleteMany({}), OutboundMessage.deleteMany({}), AutomationFlow.deleteMany({}), AutomationExecution.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (meetingOverrides: any = {}, leadOverrides: any = {}, conversationOverrides: any = {}) => {
    const userId = leadOverrides.userId ?? new mongoose.Types.ObjectId(); const platform = leadOverrides.platform ?? 'whatsapp';
    const lead: any = await Lead.create({ userId, username: leadOverrides.username ?? `${platform}-meeting`, phone: platform === 'whatsapp' ? '573001112233' : undefined, platform, currentChannel: platform, status: 'interested', score: 75, interestLevel: 'warm', ...leadOverrides });
    const conversation: any = await Conversation.create({ userId, leadId: lead._id, status: 'active', controlMode: 'automated', lastMessage: new Date(now.getTime() - 3600000), messages: [{ sender: 'lead', text: 'Confirmo la reunión', platform, timestamp: new Date(now.getTime() - 7200000) }, { sender: 'ai', text: 'Perfecto, quedó agendada', platform, timestamp: new Date(now.getTime() - 3600000) }], ...conversationOverrides });
    const meeting: any = await Meeting.create({ userId, leadId: lead._id, conversationId: conversation._id, provider: 'zoom', status: 'confirmed', originChannel: platform, scheduledFor: new Date(now.getTime() + 45 * 60000), scheduledAt: new Date(now.getTime() + 45 * 60000), timezone: 'America/Bogota', durationMinutes: 30, lifecycleHistory: [{ status: 'confirmed', at: new Date(now.getTime() - 86400000), reason: 'test' }], ...meetingOverrides });
    return { userId, lead, conversation, meeting };
  };

  test('creates configured reminder windows idempotently and never sends automatically', async () => {
    const { meeting } = await prepare();
    expect(await MeetingAutomationService.process(20, now)).toBe(2);
    expect(await MeetingAction.countDocuments({ meetingId: meeting._id, kind: 'reminder', status: 'completed' })).toBe(2);
    expect(await Task.countDocuments({ 'metadata.meetingId': meeting._id.toString(), status: 'pending' })).toBe(2);
    expect(await AssistedProposal.countDocuments({ leadId: meeting.leadId, purpose: 'meeting_reminder' })).toBe(2);
    expect(await OutboundMessage.countDocuments({})).toBe(0);
    expect(await MeetingAutomationService.process(20, now)).toBe(0);
  });

  test('preserves timezone in a contextual reminder', async () => {
    const { lead } = await prepare({ timezone: 'America/Bogota' }); await MeetingAutomationService.process(20, now);
    const proposal: any = await AssistedProposal.findOne({ leadId: lead._id, status: 'proposed' }).sort({ createdAt: -1 });
    expect(proposal.text).toContain('America/Bogota');
  });

  test('only one of two workers processes each reminder action', async () => {
    const { meeting } = await prepare();
    const results = await Promise.all([MeetingAutomationService.process(10, now), MeetingAutomationService.process(10, now)]);
    expect(results.reduce((sum, value) => sum + value, 0)).toBe(2);
    expect(await MeetingAction.countDocuments({ meetingId: meeting._id, kind: 'reminder' })).toBe(2);
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('cancels old reminders and proposals when rescheduled', async () => {
    const { userId, meeting } = await prepare(); await MeetingAutomationService.process(20, now);
    await Meeting.updateOne({ _id: meeting._id }, { $set: { scheduledFor: new Date(now.getTime() + 3 * 86400000), scheduledAt: new Date(now.getTime() + 3 * 86400000) } });
    await MeetingAutomationService.materialize(now);
    expect(await MeetingAction.countDocuments({ meetingId: meeting._id, kind: 'reminder', status: 'cancelled' })).toBe(2);
    expect(await AssistedProposal.countDocuments({ userId, purpose: 'meeting_reminder', status: 'cancelled' })).toBeGreaterThan(0);
  });

  test('reconciles cancellation without opening CRM and prepares contextual follow-up', async () => {
    const { userId, meeting } = await prepare(); await MeetingAutomationService.process(20, now);
    await new MeetingLifecycleService({ name: 'mock', createMeeting: jest.fn() } as any).cancel(userId.toString(), meeting._id.toString());
    await MeetingAutomationService.process(20, now);
    expect(await Meeting.findById(meeting._id)).toMatchObject({ status: 'cancelled', outcome: { type: 'cancelled' } });
    expect(await AssistedProposal.findOne({ meetingId: { $exists: false }, purpose: 'meeting_followup' })).not.toBeNull();
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('completed meeting generates post-meeting task/proposal without changing qualification', async () => {
    const { userId, lead, meeting } = await prepare(); await new MeetingLifecycleService().complete(userId.toString(), meeting._id.toString()); await MeetingAutomationService.process(20, now);
    expect(await Meeting.findById(meeting._id)).toMatchObject({ status: 'completed', outcome: { type: 'attended', recordedBy: 'human' } });
    expect(await Task.findOne({ leadId: lead._id, 'metadata.followUpPurpose': 'post_meeting_followup' })).not.toBeNull();
    expect(await AssistedProposal.findOne({ leadId: lead._id, purpose: 'meeting_followup' })).not.toBeNull();
    expect(await Lead.findById(lead._id)).toMatchObject({ score: 75, status: 'interested', interestLevel: 'warm' });
  });

  test('past meeting becomes pending review, never automatic no-show', async () => {
    const { meeting } = await prepare({ scheduledFor: new Date(now.getTime() - 3 * 3600000), scheduledAt: new Date(now.getTime() - 3 * 3600000) });
    await MeetingAutomationService.process(20, now);
    expect(await Meeting.findById(meeting._id)).toMatchObject({ status: 'pending_review', outcome: { type: 'pending_review', actor: 'unknown', recordedBy: 'durable_worker' } });
    expect(await Task.findOne({ 'metadata.meetingId': meeting._id.toString(), 'metadata.followUpPurpose': 'meeting_outcome_review' })).not.toBeNull();
    expect(await AssistedProposal.countDocuments({ meetingId: meeting._id })).toBe(0);
  });

  test('human-confirmed no-show is traceable and emits an event', async () => {
    const { userId, lead, meeting } = await prepare({ scheduledFor: new Date(now.getTime() - 3600000), scheduledAt: new Date(now.getTime() - 3600000), status: 'pending_review' });
    await AutomationFlow.create({ userId, name: 'No-show', status: 'active', isActive: true, trigger: { type: 'meeting.no_show' }, actions: [{ type: 'add_tag', config: { tag: 'no-show-review' } }] });
    await new MeetingLifecycleService().markNoShow(userId.toString(), meeting._id.toString(), 'prospect', 'No ingresó a la sala');
    await MeetingAutomationService.process(20, now);
    expect(await Meeting.findById(meeting._id)).toMatchObject({ status: 'no_show', outcome: { type: 'no_show', actor: 'prospect', reason: 'No ingresó a la sala', recordedBy: 'human' } });
    expect((await Lead.findById(lead._id))?.tags).toContain('no-show-review');
    expect(await AssistedProposal.findOne({ purpose: 'meeting_followup' })).not.toBeNull();
  });

  test('technical/ambiguous failure creates reviewable follow-up and never retries provider', async () => {
    const { meeting } = await prepare({ status: 'failed', failedAt: now, errorCode: 'ZOOM_TIMEOUT', errorMessage: 'Resultado ambiguo', outcome: { type: 'technical_failure', actor: 'unknown', reason: 'timeout', recordedAt: now, recordedBy: 'human' } });
    await MeetingAutomationService.process(20, now);
    expect(await MeetingAction.findOne({ meetingId: meeting._id, kind: 'post_meeting' })).toMatchObject({ status: 'completed', reason: 'technical_failure' });
    expect(await AssistedProposal.findOne({ purpose: 'meeting_followup' })).not.toBeNull();
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test.each([['opt-out', { tags: ['no_contactar'] }, {}], ['handoff', {}, { controlMode: 'handoff_requested' }], ['human', {}, { controlMode: 'human_controlled' }]])('respects %s safety policy', async (_label, leadOverrides, conversationOverrides) => {
    await prepare({}, leadOverrides, conversationOverrides); await MeetingAutomationService.process(20, now);
    expect(await AssistedProposal.countDocuments({})).toBe(0); expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('isolates owners and preserves Instagram/Facebook destinations', async () => {
    const ig = await prepare({ scheduledFor: new Date(now.getTime() + 45 * 60000), scheduledAt: new Date(now.getTime() + 45 * 60000) }, { platform: 'instagram', username: 'ig-id' });
    const fb = await prepare({ scheduledFor: new Date(now.getTime() + 45 * 60000), scheduledAt: new Date(now.getTime() + 45 * 60000) }, { platform: 'facebook', username: 'fb-id' });
    await MeetingAutomationService.process(20, now);
    expect(await AssistedProposal.findOne({ userId: ig.userId, status: 'proposed' })).toMatchObject({ platform: 'instagram', recipient: { type: 'instagram_user', externalId: 'ig-id' } });
    expect(await AssistedProposal.findOne({ userId: fb.userId, status: 'proposed' })).toMatchObject({ platform: 'facebook', recipient: { type: 'facebook_user', externalId: 'fb-id' } });
  });

  test('supports Calendly and Zoom meetings with the same internal reminder semantics', async () => {
    const zoom = await prepare({ provider: 'zoom' }, { username: 'zoom-lead' }); const calendly = await prepare({ provider: 'calendly' }, { username: 'calendly-lead' });
    await MeetingAutomationService.process(20, now);
    expect(await MeetingAction.countDocuments({ meetingId: zoom.meeting._id, kind: 'reminder' })).toBe(2);
    expect(await MeetingAction.countDocuments({ meetingId: calendly.meeting._id, kind: 'reminder' })).toBe(2);
  });

  test('expires meeting proposal on status, schedule or conversation change', async () => {
    const { meeting, conversation } = await prepare(); await MeetingAutomationService.process(20, now); const proposal: any = await AssistedProposal.findOne({ purpose: 'meeting_reminder', status: 'proposed' });
    await Meeting.updateOne({ _id: meeting._id }, { $set: { status: 'cancelled' } }); expect((await MeetingAutomationService.validateProposal(proposal, now)).reason).toBe('meeting_status_changed');
    await Meeting.updateOne({ _id: meeting._id }, { $set: { status: 'confirmed', scheduledFor: new Date(now.getTime() + 5 * 3600000) } }); expect((await MeetingAutomationService.validateProposal(proposal, now)).reason).toBe('meeting_rescheduled');
    await Meeting.updateOne({ _id: meeting._id }, { $set: { scheduledFor: proposal.contextSnapshot.meetingScheduledFor } }); await Conversation.updateOne({ _id: conversation._id }, { $set: { lastMessage: now } }); expect((await MeetingAutomationService.validateProposal(proposal, now)).reason).toBe('conversation_changed');
  });

  test('YouTube gets a safe task only because no thread recipient is inferred', async () => {
    await prepare({}, { platform: 'youtube', username: 'channel-only' }); await MeetingAutomationService.process(20, now);
    expect(await Task.countDocuments({ status: 'pending' })).toBe(2); expect(await AssistedProposal.countDocuments({})).toBe(0); expect(await OutboundMessage.countDocuments({})).toBe(0);
  });
});
