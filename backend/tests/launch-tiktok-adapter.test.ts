import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import Launch from '../src/models/Launch';
import LaunchAction from '../src/models/LaunchAction';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchTikTokContent from '../src/models/LaunchTikTokContent';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import { TikTokProvider } from '../src/integrations/tiktok';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchTikTokContentService } from '../src/services/LaunchTikTokContentService';
import { MessagingService } from '../src/services/MessagingService';
import { TikTokIngestionService } from '../src/services/TikTokIngestionService';
import { TikTokLaunchAdapter } from '../src/services/TikTokLaunchAdapter';
import { TikTokLaunchFixtures } from '../src/services/TikTokLaunchFixtures';

describe('Launch L6F TikTok mock inbound adapter', () => {
  let mongo: MongoMemoryServer;
  const originalEnvironment = { ...process.env };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
      LaunchExternalEvent.syncIndexes(),
      LaunchTikTokContent.syncIndexes(),
      InboundEvent.syncIndexes(),
    ]);
  });
  beforeEach(() => {
    process.env.TIKTOK_API_APPROVED = 'false';
    process.env.TIKTOK_INGESTION_ENABLED = 'false';
    process.env.TIKTOK_MESSAGING_ENABLED = 'false';
    process.env.TIKTOK_LAUNCH_EVENT_TOLERANCE_MS = '3600000';
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchExternalEvent.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchAction.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      LaunchTikTokContent.deleteMany({}),
      Launch.deleteMany({}),
      InboundEvent.deleteMany({}),
      OutboundMessage.deleteMany({}),
      Conversation.deleteMany({}),
      Lead.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    process.env = originalEnvironment;
    await mongoose.disconnect();
    await mongo.stop();
  });

  const setup = async (suffix = '') => {
    const owner = new mongoose.Types.ObjectId();
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: `TikTok launch ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: ['tiktok'],
      idempotencyKey: `tiktok-launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    await Launch.updateOne({ _id: launch._id }, { $set: { status: 'scheduled' } });
    const lead: any = await Lead.create({
      userId: owner,
      username: 'tiktok-user-1',
      platform: 'tiktok',
      currentChannel: 'tiktok',
      status: 'interested',
    });
    const conversation: any = await Conversation.create({
      userId: owner,
      leadId: lead._id,
      messages: [],
    });
    const participant: any = await LaunchLifecycleService.addParticipant(owner.toString(), {
      launchId: launch._id.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      source: 'l6f-fixture',
      entryChannel: 'tiktok',
      evidence: { type: 'fixture', referenceId: `tiktok-participant-${suffix}` },
      idempotencyKey: `tiktok-participant-${suffix || owner}`,
      actor: owner.toString(),
    });
    const mapping: any = await LaunchTikTokContentService.link(
      owner.toString(),
      launch._id.toString(),
      {
        accountId: 'tiktok-account-1',
        contentId: 'tiktok-video-1',
        actor: owner.toString(),
      }
    );
    return { owner, launch, lead, conversation, participant, mapping };
  };

  const adapt = async (data: any, fixture: any) =>
    TikTokLaunchAdapter.ingest(
      data.owner.toString(),
      new TikTokProvider().normalizeEvent(fixture),
      {
        leadId: data.lead._id.toString(),
        conversationId: data.conversation._id.toString(),
      }
    );

  test('normalizes only supported comment fields and preserves no recipient', () => {
    const normalized = new TikTokProvider().normalizeEvent(TikTokLaunchFixtures.associated());
    expect(normalized).toMatchObject({
      eventType: 'comment',
      mediaId: 'tiktok-video-1',
      accountId: 'tiktok-account-1',
      commentId: 'comment-associated',
    });
    expect(normalized).not.toHaveProperty('recipient');
    expect(TikTokLaunchAdapter.isSupported(normalized)).toBe(true);
  });

  test('does not implement DM as a Launch capability', () => {
    const normalized = new TikTokProvider().normalizeEvent(TikTokLaunchFixtures.directMessage());
    expect(TikTokLaunchAdapter.isSupported(normalized)).toBe(false);
    expect(
      TikTokLaunchAdapter.hasMappedContent(new mongoose.Types.ObjectId().toString(), normalized)
    ).resolves.toBe(false);
    expect((TikTokProvider.prototype as any).sendMessage).toBeUndefined();
  });

  test('mapped comment is weak evidence and changes no L3 facts', async () => {
    const data = await setup('mapped');
    const result: any = await adapt(data, TikTokLaunchFixtures.associated());
    expect(result).toMatchObject({
      provider: 'tiktok',
      status: 'pending_review',
      result: { operation: 'none', state: 'weak_interaction_requires_review' },
    });
    const participant = await LaunchParticipant.findById(data.participant._id);
    expect(participant).toMatchObject({
      registration: { status: 'unknown' },
      confirmation: { status: 'unknown' },
      attendance: { status: 'unknown' },
    });
    expect(
      await LaunchEvent.countDocuments({
        eventType: {
          $in: [
            'launch.participant_registered',
            'launch.participant_confirmed',
            'launch.participant_attendance_changed',
          ],
        },
      })
    ).toBe(0);
  });

  test('unmapped and ambiguous content remain pending review', async () => {
    const data = await setup('ambiguous');
    const unmapped: any = await adapt(data, TikTokLaunchFixtures.unassociated());
    const ambiguous: any = await adapt(data, TikTokLaunchFixtures.ambiguous());
    expect(unmapped.association.reason).toBe('explicit_launch_required');
    expect(ambiguous.association.reason).toBe('explicit_launch_required');
    expect(unmapped.status).toBe('pending_review');
    expect(ambiguous.status).toBe('pending_review');
  });

  test('known lead outside the launch participant set stays pending review', async () => {
    const data = await setup('outsider');
    const outsider: any = await Lead.create({
      userId: data.owner,
      username: 'tiktok-outsider',
      platform: 'tiktok',
      status: 'interested',
    });
    const conversation: any = await Conversation.create({
      userId: data.owner,
      leadId: outsider._id,
      messages: [],
    });
    const result: any = await TikTokLaunchAdapter.ingest(
      data.owner.toString(),
      new TikTokProvider().normalizeEvent(TikTokLaunchFixtures.nonParticipant()),
      { leadId: outsider._id.toString(), conversationId: conversation._id.toString() }
    );
    expect(result).toMatchObject({
      status: 'pending_review',
      association: { reason: 'deterministic_participant_reference_required' },
    });
  });

  test('mapping is owner-scoped, idempotent and cannot be reassigned', async () => {
    const data = await setup('mapping');
    const again: any = await LaunchTikTokContentService.link(
      data.owner.toString(),
      data.launch._id.toString(),
      { accountId: 'tiktok-account-1', contentId: 'tiktok-video-1', actor: 'test' }
    );
    expect(again._id.toString()).toBe(data.mapping._id.toString());
    expect(
      await LaunchTikTokContentService.list(
        new mongoose.Types.ObjectId().toString(),
        data.launch._id.toString()
      )
    ).toHaveLength(0);
    const other: any = await LaunchLifecycleService.createLaunch(data.owner.toString(), {
      name: 'Other TikTok launch',
      timezone: 'America/Bogota',
      allowedChannels: ['tiktok'],
      idempotencyKey: 'other-tiktok-launch',
      actor: 'test',
    });
    await expect(
      LaunchTikTokContentService.link(data.owner.toString(), other._id.toString(), {
        accountId: 'tiktok-account-1',
        contentId: 'tiktok-video-1',
        actor: 'test',
      })
    ).rejects.toMatchObject({ code: 'TIKTOK_CONTENT_CONFLICT' });
  });

  test('duplicates and concurrency create one external event and no action', async () => {
    const data = await setup('duplicate');
    const fixture = TikTokLaunchFixtures.comment('same-comment');
    await Promise.all([adapt(data, fixture), adapt(data, fixture), adapt(data, fixture)]);
    expect(
      await LaunchExternalEvent.countDocuments({ externalEventId: 'tiktok:same-comment' })
    ).toBe(1);
    expect(
      await LaunchEvent.countDocuments({
        eventType: {
          $in: [
            'launch.participant_registered',
            'launch.participant_confirmed',
            'launch.participant_attendance_changed',
          ],
        },
      })
    ).toBe(0);
  });

  test('wrong owner cannot use another mapping', async () => {
    const data = await setup('owner');
    const event = new TikTokProvider().normalizeEvent(TikTokLaunchFixtures.associated());
    const otherOwner = new mongoose.Types.ObjectId().toString();
    expect(await TikTokLaunchAdapter.hasMappedContent(otherOwner, event)).toBe(false);
    const result: any = await TikTokLaunchAdapter.ingest(otherOwner, event, {
      leadId: data.lead._id.toString(),
      conversationId: data.conversation._id.toString(),
    });
    expect(result.association.reason).toBe('explicit_launch_required');
  });

  test('terminal launch and cancelled participant are ignored', async () => {
    const data = await setup('policies');
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'completed' } });
    const terminal: any = await adapt(data, TikTokLaunchFixtures.comment('terminal'));
    expect(terminal).toMatchObject({
      status: 'ignored',
      association: { reason: 'launch_not_active' },
    });
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'scheduled' } });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'registration.status': 'cancelled' } }
    );
    const cancelled: any = await adapt(data, TikTokLaunchFixtures.comment('cancelled'));
    expect(cancelled).toMatchObject({
      status: 'ignored',
      association: { reason: 'participant_registration_cancelled' },
    });
  });

  test('mapped non-INFO ingestion projects safely without invoking orchestrator', async () => {
    const data = await setup('integration');
    const orchestrator = jest.fn();
    const result = await new TikTokIngestionService(
      undefined,
      orchestrator,
      true
    ).processOfficialEvent(data.owner.toString(), TikTokLaunchFixtures.associated('ingestion'));
    expect(result).toBe('processed');
    expect(orchestrator).not.toHaveBeenCalled();
    expect(await LaunchExternalEvent.countDocuments({ externalEventId: 'tiktok:ingestion' })).toBe(
      1
    );
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('explicit opt-out rejects lead and participant without channel migration', async () => {
    const data = await setup('optout');
    const orchestrator = jest.fn();
    await new TikTokIngestionService(undefined, orchestrator, true).processOfficialEvent(
      data.owner.toString(),
      TikTokLaunchFixtures.optOut('optout-event')
    );
    expect(orchestrator).not.toHaveBeenCalled();
    expect(await Lead.findById(data.lead._id)).toMatchObject({
      status: 'rejected',
      currentChannel: 'tiktok',
    });
    expect(await LaunchParticipant.findById(data.participant._id)).toMatchObject({
      stage: { status: 'opted_out' },
    });
  });

  test('failed projection can retry without duplicating the conversation message', async () => {
    const data = await setup('retry');
    const fixture = TikTokLaunchFixtures.associated('retry-event');
    const failure = jest
      .spyOn(TikTokLaunchAdapter, 'ingest')
      .mockRejectedValueOnce(new Error('simulated projection failure'));
    await expect(
      new TikTokIngestionService(undefined, undefined, true).processOfficialEvent(
        data.owner.toString(),
        fixture
      )
    ).rejects.toThrow('simulated projection failure');
    failure.mockRestore();
    await InboundEvent.updateOne(
      { userId: data.owner, externalEventId: 'retry-event' },
      { $set: { retryAfter: new Date(Date.now() - 1000) } }
    );
    await expect(
      new TikTokIngestionService(undefined, undefined, true).processOfficialEvent(
        data.owner.toString(),
        fixture
      )
    ).resolves.toBe('processed');
    const conversation: any = await Conversation.findById(data.conversation._id);
    expect(
      conversation.messages.filter((message: any) => message.externalMessageId === 'retry-event')
    ).toHaveLength(1);
    expect(await InboundEvent.findOne({ externalEventId: 'retry-event' })).toMatchObject({
      processingState: 'completed',
      processingAttempts: 2,
    });
  });

  test('L6F creates zero outbound and calls no messaging service', async () => {
    const data = await setup('safety');
    const messaging = jest.spyOn(MessagingService, 'send');
    await adapt(data, TikTokLaunchFixtures.associated('safe'));
    expect(await OutboundMessage.countDocuments({})).toBe(0);
    expect(messaging).not.toHaveBeenCalled();
    expect((TikTokProvider.prototype as any).sendMessage).toBeUndefined();
    expect(process.env.TIKTOK_API_APPROVED).toBe('false');
    expect(process.env.TIKTOK_INGESTION_ENABLED).toBe('false');
    expect(process.env.TIKTOK_MESSAGING_ENABLED).toBe('false');
  });
});
