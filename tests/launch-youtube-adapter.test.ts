import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import AssistedProposal from '../src/models/AssistedProposal';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import Launch from '../src/models/Launch';
import LaunchAction from '../src/models/LaunchAction';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchYouTubeVideo from '../src/models/LaunchYouTubeVideo';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import { YouTubeMessagingProvider } from '../src/integrations/messaging/YouTubeMessagingProvider';
import { AlmaService } from '../src/services/AlmaService';
import { AutomationEngineService } from '../src/services/AutomationEngineService';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchYouTubeVideoService } from '../src/services/LaunchYouTubeVideoService';
import { MessagingService } from '../src/services/MessagingService';
import { YouTubeIngestionService } from '../src/services/YouTubeIngestionService';
import { YouTubeLaunchAdapter } from '../src/services/YouTubeLaunchAdapter';
import { YouTubeLaunchFixtures } from '../src/services/YouTubeLaunchFixtures';
import { YouTubeOptOutService } from '../src/services/YouTubeOptOutService';

describe('Launch L6E YouTube mock inbound adapter', () => {
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
      LaunchYouTubeVideo.syncIndexes(),
      InboundEvent.syncIndexes(),
    ]);
  });

  beforeEach(() => {
    process.env.YOUTUBE_INGESTION_MODE = 'mock';
    process.env.YOUTUBE_MESSAGING_MODE = 'mock';
    process.env.YOUTUBE_LAUNCH_EVENT_TOLERANCE_MS = '3600000';
    process.env.AI_MODE = 'mock';
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchExternalEvent.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchAction.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      LaunchYouTubeVideo.deleteMany({}),
      Launch.deleteMany({}),
      InboundEvent.deleteMany({}),
      AssistedProposal.deleteMany({}),
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
      name: `YouTube launch ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: ['youtube'],
      idempotencyKey: `youtube-launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    await Launch.updateOne({ _id: launch._id }, { $set: { status: 'scheduled' } });
    const lead: any = await Lead.create({
      userId: owner,
      username: `youtube-author-${suffix || '1'}`,
      platform: 'youtube',
      currentChannel: 'youtube',
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
      source: 'l6e-fixture',
      entryChannel: 'youtube',
      evidence: { type: 'fixture', referenceId: `youtube-participant-${suffix}` },
      idempotencyKey: `youtube-participant-${suffix || owner}`,
      actor: owner.toString(),
    });
    const mapping: any = await LaunchYouTubeVideoService.link(
      owner.toString(),
      launch._id.toString(),
      { channelId: 'owned-channel-1', videoId: 'video-1', actor: owner.toString() }
    );
    return { owner, launch, lead, conversation, participant, mapping };
  };

  const adapt = async (data: any, fixture: any, rootId = fixture.id) => {
    const normalized = YouTubeLaunchAdapter.normalize(fixture, rootId, 'owned-channel-1');
    if (!normalized) throw new Error('Fixture did not normalize');
    return YouTubeLaunchAdapter.ingest(data.owner.toString(), normalized, {
      leadId: data.lead._id.toString(),
      conversationId: data.conversation._id.toString(),
    });
  };

  test('normalizes root comments and thread replies without inventing recipients', () => {
    const root = YouTubeLaunchAdapter.normalize(
      YouTubeLaunchFixtures.root('root-1'),
      'root-1',
      'owned-channel-1'
    );
    const replyFixture = YouTubeLaunchFixtures.reply('reply-1', 'root-1');
    const reply = YouTubeLaunchAdapter.normalize(
      replyFixture.comment,
      replyFixture.rootCommentId,
      'owned-channel-1'
    );
    expect(root).toMatchObject({ eventType: 'root_comment', videoId: 'video-1' });
    expect(reply).toMatchObject({ eventType: 'thread_reply', rootCommentId: 'root-1' });
    expect(root).not.toHaveProperty('recipient');
    expect(reply).not.toHaveProperty('recipient');
  });

  test('mapped root comment is weak evidence pending human review', async () => {
    const data = await setup('root');
    const result: any = await adapt(
      data,
      YouTubeLaunchFixtures.root('mapped-root', 'video-1', 'Quiero saber más', data.lead.username)
    );
    expect(result).toMatchObject({
      provider: 'youtube',
      eventType: 'comment',
      status: 'pending_review',
      result: { operation: 'none', state: 'weak_interaction_requires_review' },
    });
    expect(result.association.launchId.toString()).toBe(data.launch._id.toString());
    const participant = await LaunchParticipant.findById(data.participant._id);
    expect(participant?.registration.status).toBe('unknown');
    expect(participant?.confirmation.status).toBe('unknown');
    expect(participant?.attendance.status).toBe('unknown');
  });

  test('reply inherits an exact root association when video metadata is absent', async () => {
    const data = await setup('thread');
    await adapt(
      data,
      YouTubeLaunchFixtures.root('thread-root', 'video-1', 'Comentario raíz', data.lead.username)
    );
    const reply = YouTubeLaunchFixtures.reply(
      'thread-reply',
      'thread-root',
      'video-1',
      'Continuación',
      data.lead.username
    );
    delete (reply.comment.snippet as any).videoId;
    const result: any = await adapt(data, reply.comment, reply.rootCommentId);
    expect(result.association.launchId.toString()).toBe(data.launch._id.toString());
    expect(result.metadata.commentType).toBe('thread_reply');
    expect(result.status).toBe('pending_review');
  });

  test('unmapped video and ambiguous thread remain unresolved', async () => {
    const data = await setup('unmapped');
    const result: any = await adapt(
      data,
      YouTubeLaunchFixtures.root('unmapped-root', 'other-video', 'Comentario', data.lead.username)
    );
    expect(result).toMatchObject({
      status: 'pending_review',
      association: { resolution: 'unresolved', reason: 'explicit_launch_required' },
    });
    const reply = YouTubeLaunchFixtures.reply(
      'orphan-reply',
      'missing-root',
      'other-video',
      'Respuesta huérfana',
      data.lead.username
    );
    const orphan: any = await adapt(data, reply.comment, reply.rootCommentId);
    expect(orphan.association.reason).toBe('explicit_launch_required');
  });

  test('known lead outside the participant set remains pending review', async () => {
    const data = await setup('nonparticipant');
    const outsider: any = await Lead.create({
      userId: data.owner,
      username: 'youtube-non-participant',
      platform: 'youtube',
      currentChannel: 'youtube',
      status: 'interested',
    });
    const conversation: any = await Conversation.create({
      userId: data.owner,
      leadId: outsider._id,
      messages: [],
    });
    const fixture = YouTubeLaunchFixtures.nonParticipant();
    const normalized = YouTubeLaunchAdapter.normalize(fixture, fixture.id, 'owned-channel-1')!;
    const result: any = await YouTubeLaunchAdapter.ingest(data.owner.toString(), normalized, {
      leadId: outsider._id.toString(),
      conversationId: conversation._id.toString(),
    });
    expect(result).toMatchObject({
      status: 'pending_review',
      association: {
        resolution: 'unresolved',
        reason: 'deterministic_participant_reference_required',
      },
    });
  });

  test('a different owner cannot reuse mapping or root-thread association', async () => {
    const data = await setup('owner');
    await adapt(
      data,
      YouTubeLaunchFixtures.root('owner-root', 'video-1', 'Raíz', data.lead.username)
    );
    const otherOwner = new mongoose.Types.ObjectId();
    const event = YouTubeLaunchAdapter.normalize(
      YouTubeLaunchFixtures.reply('owner-reply', 'owner-root').comment,
      'owner-root',
      'owned-channel-1'
    )!;
    expect(await YouTubeLaunchAdapter.hasMappedVideo(otherOwner.toString(), event)).toBe(false);
    const result: any = await YouTubeLaunchAdapter.ingest(otherOwner.toString(), event, {
      leadId: data.lead._id.toString(),
      conversationId: data.conversation._id.toString(),
    });
    expect(result).toMatchObject({
      status: 'pending_review',
      association: { resolution: 'unresolved', reason: 'explicit_launch_required' },
    });
  });

  test('mapping is owner-scoped, idempotent and cannot be reassigned', async () => {
    const data = await setup('mapping');
    const again: any = await LaunchYouTubeVideoService.link(
      data.owner.toString(),
      data.launch._id.toString(),
      { channelId: 'owned-channel-1', videoId: 'video-1', actor: data.owner.toString() }
    );
    expect(again._id.toString()).toBe(data.mapping._id.toString());
    const other: any = await LaunchLifecycleService.createLaunch(data.owner.toString(), {
      name: 'Other launch',
      timezone: 'America/Bogota',
      allowedChannels: ['youtube'],
      idempotencyKey: 'youtube-other-launch',
      actor: data.owner.toString(),
    });
    await expect(
      LaunchYouTubeVideoService.link(data.owner.toString(), other._id.toString(), {
        channelId: 'owned-channel-1',
        videoId: 'video-1',
        actor: data.owner.toString(),
      })
    ).rejects.toMatchObject({ code: 'YOUTUBE_VIDEO_CONFLICT' });
    expect(
      await LaunchYouTubeVideoService.list(
        new mongoose.Types.ObjectId().toString(),
        data.launch._id.toString()
      )
    ).toHaveLength(0);
  });

  test('duplicate and concurrent delivery create one external event', async () => {
    const data = await setup('duplicate');
    const fixture = YouTubeLaunchFixtures.root(
      'same-event',
      'video-1',
      'Comentario único',
      data.lead.username
    );
    const results: any[] = await Promise.all([
      adapt(data, fixture),
      adapt(data, fixture),
      adapt(data, fixture),
    ]);
    expect(
      await LaunchExternalEvent.countDocuments({ externalEventId: 'youtube:same-event' })
    ).toBe(1);
    expect(new Set(results.map(item => item._id.toString())).size).toBe(1);
  });

  test('terminal launch and opted-out participant are ignored by central policy', async () => {
    const data = await setup('policies');
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'completed' } });
    const terminal: any = await adapt(
      data,
      YouTubeLaunchFixtures.root('terminal', 'video-1', 'Comentario', data.lead.username)
    );
    expect(terminal).toMatchObject({
      status: 'ignored',
      association: { reason: 'launch_not_active' },
    });
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'scheduled' } });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'stage.status': 'opted_out' } }
    );
    const optedOut: any = await adapt(
      data,
      YouTubeLaunchFixtures.root('opted-out', 'video-1', 'Comentario', data.lead.username)
    );
    expect(optedOut).toMatchObject({
      status: 'ignored',
      association: { reason: 'participant_not_active' },
    });
  });

  test('explicit opt-out rejects lead and participant and invalidates proposals', async () => {
    const data = await setup('optout');
    await AssistedProposal.create({
      userId: data.owner,
      leadId: data.lead._id,
      conversationId: data.conversation._id,
      sourceEventId: 'test-youtube-optout-proposal',
      platform: 'whatsapp',
      text: 'Propuesta pendiente',
      originalText: 'Propuesta pendiente',
      status: 'proposed',
    });
    expect(YouTubeOptOutService.matches('No quiero continuar')).toBe(true);
    await YouTubeOptOutService.apply(
      data.owner.toString(),
      data.lead._id.toString(),
      'youtube:optout',
      new Date()
    );
    expect(await Lead.findById(data.lead._id)).toMatchObject({
      status: 'rejected',
      tags: ['opt_out'],
    });
    expect(await LaunchParticipant.findById(data.participant._id)).toMatchObject({
      stage: { status: 'opted_out' },
    });
    expect(await AssistedProposal.findOne({ leadId: data.lead._id })).toMatchObject({
      status: 'cancelled',
      invalidationReason: 'explicit_youtube_opt_out',
    });
  });

  test('existing ingestion accepts mapped non-INFO comment and projects it safely', async () => {
    const data = await setup('integration');
    jest.spyOn(AlmaService, 'processMessage').mockResolvedValue(undefined as never);
    jest.spyOn(AutomationEngineService, 'emitMessageEvents').mockResolvedValue(undefined as never);
    const result = await new YouTubeIngestionService().processComment(
      data.owner.toString(),
      YouTubeLaunchFixtures.root(
        'ingestion-comment',
        'video-1',
        'Me interesa este lanzamiento',
        data.lead.username
      ),
      'ingestion-comment',
      'owned-channel-1'
    );
    expect(result).toBe('processed');
    expect(
      await InboundEvent.countDocuments({ externalEventId: 'youtube:ingestion-comment' })
    ).toBe(1);
    expect(
      await LaunchExternalEvent.countDocuments({ externalEventId: 'youtube:ingestion-comment' })
    ).toBe(1);
    expect(AlmaService.processMessage).not.toHaveBeenCalled();
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('existing ingestion applies opt-out and does not invoke ALMA', async () => {
    const data = await setup('ingestion-optout');
    const alma = jest.spyOn(AlmaService, 'processMessage');
    const automation = jest.spyOn(AutomationEngineService, 'emitMessageEvents');
    const result = await new YouTubeIngestionService().processComment(
      data.owner.toString(),
      YouTubeLaunchFixtures.root(
        'ingestion-optout',
        'video-1',
        'No quiero continuar',
        data.lead.username
      ),
      'ingestion-optout',
      'owned-channel-1'
    );
    expect(result).toBe('processed');
    expect(alma).not.toHaveBeenCalled();
    expect(automation).not.toHaveBeenCalled();
    expect(await Lead.findById(data.lead._id)).toMatchObject({ status: 'rejected' });
    expect(
      await LaunchExternalEvent.findOne({ externalEventId: 'youtube:ingestion-optout' })
    ).toMatchObject({
      status: 'ignored',
      association: { reason: 'participant_not_active' },
    });
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('L6E adapter creates no outbound and calls no messaging provider', async () => {
    const data = await setup('safety');
    const messaging = jest.spyOn(MessagingService, 'send');
    const provider = jest.spyOn(YouTubeMessagingProvider.prototype, 'sendMessage');
    await adapt(
      data,
      YouTubeLaunchFixtures.root('safe-root', 'video-1', 'Comentario', data.lead.username)
    );
    expect(await OutboundMessage.countDocuments({})).toBe(0);
    expect(messaging).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
    expect(process.env.YOUTUBE_INGESTION_MODE).toBe('mock');
    expect(process.env.YOUTUBE_MESSAGING_MODE).toBe('mock');
  });
});
