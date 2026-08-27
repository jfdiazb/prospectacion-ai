import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchAction from '../src/models/LaunchAction';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import Meeting from '../src/models/Meeting';
import Task from '../src/models/Task';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import AutomationExecution from '../src/models/AutomationExecution';
import AutomationFlow from '../src/models/AutomationFlow';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchActionService } from '../src/services/LaunchActionService';
import { MessagingService } from '../src/services/MessagingService';

describe('Launch L4 assisted actions', () => {
  let mongo: MongoMemoryServer;
  const now = new Date('2027-09-01T12:00:00Z');
  const originalEnv = process.env;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([LaunchAction.syncIndexes(), AssistedProposal.syncIndexes()]);
  });
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      AI_MODE: 'mock',
      FOLLOWUP_COOLDOWN_MS: '60000',
      FOLLOWUP_MAX_ATTEMPTS: '3',
      META_MESSAGING_MODE: 'mock',
      WHATSAPP_MESSAGING_MODE: 'mock',
    };
  });
  afterEach(async () => {
    process.env = originalEnv;
    jest.restoreAllMocks();
    await Promise.all([
      Launch.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchAction.deleteMany({}),
      Lead.deleteMany({}),
      Conversation.deleteMany({}),
      ContactProfile.deleteMany({}),
      ContactIdentity.deleteMany({}),
      Meeting.deleteMany({}),
      Task.deleteMany({}),
      AssistedProposal.deleteMany({}),
      OutboundMessage.deleteMany({}),
      AutomationExecution.deleteMany({}),
      AutomationFlow.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  const setup = async (options: any = {}) => {
    const userId = options.userId || new mongoose.Types.ObjectId();
    const eventStartsAt = options.eventStartsAt || new Date(now.getTime() + 2 * 86400000);
    const launch: any = await LaunchLifecycleService.createLaunch(userId.toString(), {
      name: 'Evento configurable',
      objective: 'Presentar opciones autorizadas',
      timezone: options.timezone || 'America/Bogota',
      startsAt: new Date(now.getTime() - 86400000),
      eventStartsAt,
      eventEndsAt: options.eventEndsAt || new Date(eventStartsAt.getTime() + 3600000),
      closesAt: options.closesAt || new Date(eventStartsAt.getTime() + 5 * 86400000),
      allowedChannels: options.allowedChannels || ['whatsapp', 'instagram', 'facebook', 'youtube'],
      followUpConfig: {
        eventReminderWindowsMinutes: [60],
        preEventMessageMinutes: 180,
        registrationReminderHours: [1],
        postEventDelayMinutes: 0,
        proposalTtlMs: 86400000,
        maxAttempts: options.maxAttempts || 3,
        messages: options.messages,
      },
      idempotencyKey: `launch:${new mongoose.Types.ObjectId()}`,
      actor: 'owner',
    });
    await LaunchLifecycleService.transitionLaunch(
      userId.toString(),
      launch._id.toString(),
      'scheduled',
      `scheduled:${launch._id}`,
      'owner'
    );
    await LaunchLifecycleService.transitionLaunch(
      userId.toString(),
      launch._id.toString(),
      'prelaunch',
      `prelaunch:${launch._id}`,
      'owner'
    );
    const platform = options.platform || 'whatsapp';
    const lead: any = await Lead.create({
      userId,
      username: `launch-${platform}-${new mongoose.Types.ObjectId()}`,
      phone: platform === 'whatsapp' ? '+573001112233' : undefined,
      platform,
      currentChannel: platform,
      status: 'interested',
      score: 70,
      interestLevel: 'warm',
    });
    const conversation: any = await Conversation.create({
      userId,
      leadId: lead._id,
      status: 'active',
      controlMode: 'automated',
      lastMessage: new Date(now.getTime() - 3600000),
      messages: [
        {
          sender: 'lead',
          text: 'Quiero conocer más',
          platform,
          timestamp: new Date(now.getTime() - 7200000),
        },
        {
          sender: 'ai',
          text: 'Gracias, lo revisamos',
          platform,
          timestamp: new Date(now.getTime() - 3600000),
        },
      ],
    });
    const participant: any = await LaunchLifecycleService.addParticipant(userId.toString(), {
      launchId: launch._id.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      source: 'segment_selection',
      idempotencyKey: `participant:${launch._id}`,
      actor: 'owner',
    });
    return { userId, launch, lead, conversation, participant };
  };
  const evidence = (ref: string) => ({
    type: 'manual' as const,
    source: 'crm',
    referenceId: ref,
    recordedBy: 'owner',
  });
  const move = (data: any, dimension: any, status: any, key: string) =>
    LaunchLifecycleService.transitionParticipant(data.userId.toString(), {
      participantId: data.participant._id.toString(),
      dimension,
      status,
      evidence: evidence(key),
      idempotencyKey: key,
      actor: 'owner',
    });

  test('creates and processes an eligible invitation as task plus assisted proposal', async () => {
    const data = await setup({ messages: { invitation: 'Invitación configurable para revisar.' } });
    expect(await LaunchActionService.process(20, now)).toBeGreaterThan(0);
    const action: any = await LaunchAction.findOne({ kind: 'invitation' });
    expect(action).toMatchObject({
      status: 'completed',
      launchId: data.launch._id,
      participantId: data.participant._id,
    });
    expect(await Task.findById(action.taskId)).not.toBeNull();
    expect(await AssistedProposal.findById(action.proposalId)).toMatchObject({
      purpose: 'launch_action',
      status: 'proposed',
      text: 'Invitación configurable para revisar.',
    });
  });
  test('blocked invitation expires without proposal', async () => {
    const data = await setup();
    await Lead.updateOne({ _id: data.lead._id }, { $set: { status: 'rejected' } });
    await LaunchActionService.process(20, now);
    expect(await LaunchAction.findOne({ kind: 'invitation' })).toMatchObject({
      status: 'cancelled',
      invalidationReason: 'opt_out_or_rejected',
    });
    expect(await AssistedProposal.countDocuments()).toBe(0);
  });
  test('invited but unregistered participant receives bounded registration reminder', async () => {
    const data = await setup();
    await move(data, 'invitation', 'invited', 'invited');
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'invitation.changedAt': new Date(now.getTime() - 2 * 3600000) } }
    );
    await LaunchActionService.process(20, now);
    expect(await LaunchAction.findOne({ kind: 'registration_reminder' })).toMatchObject({
      status: 'completed',
    });
  });
  test('registered participant makes registration reminder obsolete', async () => {
    const data = await setup();
    await move(data, 'invitation', 'invited', 'invited');
    await move(data, 'registration', 'registered', 'registered');
    await LaunchActionService.materialize(now);
    expect(await LaunchAction.countDocuments({ kind: 'registration_reminder' })).toBe(0);
  });
  test('event reminders preserve timezone and configured windows', async () => {
    const data = await setup({
      eventStartsAt: new Date(now.getTime() + 30 * 60000),
      timezone: 'America/Bogota',
    });
    await move(data, 'registration', 'registered', 'reg');
    await LaunchActionService.materialize(now);
    const reminder: any = await LaunchAction.findOne({ kind: 'event_reminder' });
    expect(reminder.launchSnapshot).toMatchObject({ timezone: 'America/Bogota' });
    expect(reminder.metadata.windowMinutes).toBe(60);
  });
  test('reprogramming invalidates previous reminders and cancellation invalidates actions', async () => {
    const data = await setup({ eventStartsAt: new Date(now.getTime() + 30 * 60000) });
    await move(data, 'registration', 'registered', 'reg');
    await LaunchActionService.materialize(now);
    await Launch.updateOne(
      { _id: data.launch._id },
      {
        $set: { eventStartsAt: new Date(now.getTime() + 86400000) },
        $inc: { configurationVersion: 1 },
      }
    );
    await LaunchActionService.reconcile(now);
    expect(await LaunchAction.findOne({ kind: 'event_reminder' })).toMatchObject({
      status: 'cancelled',
      invalidationReason: 'launch_changed',
    });
    const second = await setup();
    await LaunchActionService.materialize(now);
    await Launch.updateOne({ _id: second.launch._id }, { $set: { status: 'cancelled' } });
    await LaunchActionService.reconcile(now);
    expect(
      await LaunchAction.findOne({ launchId: second.launch._id, kind: 'invitation' })
    ).toMatchObject({ status: 'cancelled', invalidationReason: 'launch_terminal' });
  });
  test.each([
    ['attended', 'post_event_followup'],
    ['no_show', 'no_show_recovery'],
    ['unknown', 'post_event_followup'],
  ] as const)('post-event %s creates differentiated %s action', async (attendance, kind) => {
    const data = await setup({
      eventStartsAt: new Date(now.getTime() - 2 * 3600000),
      eventEndsAt: new Date(now.getTime() - 3600000),
      closesAt: new Date(now.getTime() + 86400000),
    });
    if (attendance !== 'unknown')
      await move(data, 'attendance', attendance, `attendance-${attendance}`);
    await LaunchActionService.process(30, now);
    const action: any = await LaunchAction.findOne({
      kind,
      reason:
        attendance === 'attended'
          ? 'attendance_attended'
          : attendance === 'no_show'
            ? 'attendance_no_show'
            : 'attendance_unknown_requires_review',
    }).lean();
    expect(action).toMatchObject({ status: 'completed' });
    if (attendance === 'unknown') expect(action.proposalId).toBeUndefined();
  });
  test('meeting request creates only a next-step task and never a meeting', async () => {
    const data = await setup();
    await move(data, 'outcome', 'meeting_requested', 'meeting-request');
    await LaunchActionService.process(30, now);
    expect(await LaunchAction.findOne({ kind: 'next_step_proposal' })).toMatchObject({
      status: 'completed',
    });
    expect(await Meeting.countDocuments()).toBe(0);
    expect(
      await AssistedProposal.countDocuments({
        purpose: 'launch_action',
        'contextSnapshot.participantOutcome': 'meeting_requested',
      })
    ).toBe(0);
  });
  test('confirmed opt-out and unsafe YouTube channel create no proposal', async () => {
    const data = await setup({ platform: 'youtube' });
    await LaunchActionService.process(20, now);
    expect(await Task.countDocuments()).toBeGreaterThan(0);
    expect(await AssistedProposal.countDocuments()).toBe(0);
    const blocked = await setup();
    const contact: any = await ContactProfile.create({
      userId: blocked.userId,
      createdBy: 'owner',
    });
    await ContactIdentity.create({
      userId: blocked.userId,
      contactId: contact._id,
      leadId: blocked.lead._id,
      platform: 'whatsapp',
      externalId: blocked.lead.phone,
      confirmationSource: 'human',
      consentStatus: 'opted_out',
    });
    await LaunchActionService.process(50, now);
    expect(await AssistedProposal.countDocuments({ leadId: blocked.lead._id })).toBe(0);
  });
  test('cooldown defers a newer action and max attempts skip further actions', async () => {
    const data = await setup({ maxAttempts: 1 });
    await LaunchAction.create({
      userId: data.userId,
      launchId: data.launch._id,
      participantId: data.participant._id,
      leadId: data.lead._id,
      kind: 'invitation',
      idempotencyKey: 'old-action',
      dueAt: new Date(now.getTime() - 60000),
      status: 'completed',
      completedAt: now,
      launchSnapshot: {},
      participantSnapshot: {},
    });
    await LaunchActionService.materialize(now);
    const action: any = await LaunchAction.findOne({
      idempotencyKey: { $ne: 'old-action' },
      kind: 'invitation',
    });
    expect(action).toMatchObject({ status: 'skipped', reason: 'max_attempts_reached' });
  });
  test('new response, participant change and channel change invalidate stale proposals', async () => {
    const data = await setup({ messages: { invitation: 'Revisar invitación.' } });
    await LaunchActionService.process(20, now);
    const proposal: any = await AssistedProposal.findOne({ purpose: 'launch_action' });
    await Conversation.updateOne(
      { _id: data.conversation._id },
      {
        $set: { lastMessage: new Date(now.getTime() + 1000) },
        $push: {
          messages: {
            sender: 'lead',
            text: 'Nueva respuesta',
            timestamp: new Date(now.getTime() + 1000),
            platform: 'whatsapp',
          },
        },
      }
    );
    expect(await LaunchActionService.validateProposal(proposal, now)).toMatchObject({
      valid: false,
      reason: 'conversation_changed',
    });
    const another = await setup({ messages: { invitation: 'Otra invitación.' } });
    await LaunchActionService.process(50, now);
    const otherProposal: any = await AssistedProposal.findOne({
      leadId: another.lead._id,
      purpose: 'launch_action',
    });
    await Lead.updateOne(
      { _id: another.lead._id },
      { $set: { currentChannel: 'instagram', username: 'ig-user' } }
    );
    expect(await LaunchActionService.validateProposal(otherProposal, now)).toMatchObject({
      valid: false,
      reason: 'channel_changed',
    });
  });
  test('new launch proposal replaces and audits the previous action', async () => {
    const data = await setup({ messages: { invitation: 'Primera.' } });
    await LaunchActionService.process(20, now);
    const first: any = await LaunchAction.findOne({ kind: 'invitation' });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      {
        $set: { 'stage.status': 'interested', 'invitation.status': 'invited' },
        $inc: { lifecycleVersion: 1 },
      }
    );
    await LaunchActionService.process(50, new Date(now.getTime() + 120000));
    expect(await LaunchAction.findById(first._id)).toMatchObject({
      status: 'cancelled',
      invalidationReason: expect.stringMatching(/participant_|replaced/),
    });
    expect(
      await LaunchEvent.findOne({
        eventType: { $in: ['launch.action_replaced', 'launch.action_expired'] },
        participantId: data.participant._id,
      })
    ).not.toBeNull();
  });
  test('concurrent workers materialize each action once and isolate owners', async () => {
    const one = await setup(),
      two = await setup();
    const results = await Promise.all([
      LaunchActionService.process(50, now),
      LaunchActionService.process(50, now),
    ]);
    expect(results[0] + results[1]).toBeGreaterThan(0);
    expect(await LaunchAction.countDocuments({ userId: one.userId, kind: 'invitation' })).toBe(1);
    expect(await LaunchAction.countDocuments({ userId: two.userId, kind: 'invitation' })).toBe(1);
    expect(await Task.countDocuments({ userId: one.userId })).toBe(1);
    expect(await Task.countDocuments({ userId: two.userId })).toBe(1);
  });
  test('L4 emits automation/audit events and never sends automatically', async () => {
    const spy = jest.spyOn(MessagingService, 'send');
    await setup({ messages: { invitation: 'Solo propuesta.' } });
    await LaunchActionService.process(20, now);
    expect(
      await LaunchEvent.findOne({ eventType: 'launch.action_task_and_proposal_generated' })
    ).not.toBeNull();
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(spy).not.toHaveBeenCalled();
  });
});
