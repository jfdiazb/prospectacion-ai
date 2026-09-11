import { createHash, createHmac } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import LaunchMetaContent from '../src/models/LaunchMetaContent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import OutboundMessage from '../src/models/OutboundMessage';
import InboundEvent from '../src/models/InboundEvent';
import AssistedProposal from '../src/models/AssistedProposal';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchMetaContentService } from '../src/services/LaunchMetaContentService';
import { MetaLaunchAdapter } from '../src/services/MetaLaunchAdapter';
import { MetaLaunchFixtures } from '../src/services/MetaLaunchFixtures';
import { MetaIngestionService } from '../src/services/MetaIngestionService';
import { MetaWebhookNormalizer } from '../src/integrations/meta';
import { MetaController } from '../src/controllers/MetaController';
import { MessagingService } from '../src/services/MessagingService';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';

describe('Launch L6C Meta mock inbound adapter', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
      LaunchExternalEvent.syncIndexes(),
      LaunchMetaContent.syncIndexes(),
    ]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchMetaContent.deleteMany({}),
      LaunchExternalEvent.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      Launch.deleteMany({}),
      ContactIdentity.deleteMany({}),
      ContactProfile.deleteMany({}),
      Conversation.deleteMany({}),
      Lead.deleteMany({}),
      InboundEvent.deleteMany({}),
      AssistedProposal.deleteMany({}),
      OutboundMessage.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  const setup = async (
    platform: 'instagram' | 'facebook' = 'instagram',
    username = platform === 'instagram' ? 'ig-user-1' : 'fb-user-1',
    suffix = ''
  ) => {
    const owner = new mongoose.Types.ObjectId();
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: `Meta launch ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: [platform],
      idempotencyKey: `meta-launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    await Launch.updateOne({ _id: launch._id }, { $set: { status: 'scheduled' } });
    launch.status = 'scheduled';
    const lead: any = await Lead.create({
      userId: owner,
      username,
      platform,
      currentChannel: platform,
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
      source: 'l6c-fixture',
      entryChannel: platform,
      evidence: { type: 'fixture', referenceId: `meta-participant-${suffix}` },
      idempotencyKey: `meta-participant-${suffix || owner}`,
      actor: owner.toString(),
    });
    return { owner, launch, lead, conversation, participant };
  };
  const adapt = async (data: any, payload: any) => {
    const event = MetaWebhookNormalizer.normalizePayload(payload)[0];
    return MetaLaunchAdapter.ingest(data.owner.toString(), event, {
      leadId: data.lead._id.toString(),
      conversationId: data.conversation._id.toString(),
    });
  };

  test.each([
    ['instagram comment', MetaLaunchFixtures.instagramComment('ig-comment')],
    ['instagram DM', MetaLaunchFixtures.instagramDm('ig-dm')],
    ['facebook comment', MetaLaunchFixtures.facebookComment('fb-comment')],
    ['Messenger', MetaLaunchFixtures.messenger('fb-dm')],
  ])('normalizes and persists %s as a weak LaunchExternalEvent', async (_name, payload) => {
    const event = MetaWebhookNormalizer.normalizePayload(payload)[0];
    const data = await setup(event.platform, event.externalUserId, String(_name));
    const result: any = await adapt(data, payload);
    expect(result).toMatchObject({
      provider: 'meta',
      channel: event.platform,
      eventType: event.eventType,
      status: 'pending_review',
    });
    if (result.association.resolution === 'explicit_ids')
      expect(result.result.state).toBe('weak_interaction_requires_review');
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });

  test('preserves private reply context without treating it as registration', async () => {
    const payload = MetaLaunchFixtures.messenger('private-dm', 'source-comment-1');
    const event = MetaWebhookNormalizer.normalizePayload(payload)[0];
    expect(event).toMatchObject({
      platform: 'facebook',
      eventType: 'direct_message',
      privateReplyCommentId: 'source-comment-1',
    });
    const data = await setup('facebook', 'fb-psid-1', 'private');
    const result: any = await adapt(data, payload);
    expect(result.metadata.privateReplyContext).toBe(true);
    expect(result.status).toBe('pending_review');
  });

  test('mapped content associates a comment deterministically and bypasses keyword filtering', async () => {
    const data = await setup();
    await LaunchMetaContentService.link(data.owner.toString(), data.launch._id.toString(), {
      platform: 'instagram',
      accountId: 'ig-account-1',
      contentId: 'mapped-post',
      contentType: 'post',
      actor: data.owner.toString(),
    });
    const payload = MetaLaunchFixtures.instagramComment(
      'mapped-comment',
      'mapped-post',
      'Excelente'
    );
    const accepted = await MetaIngestionService.acceptPayload(data.owner.toString(), payload);
    expect(accepted).toHaveLength(1);
    await MetaIngestionService.processAccepted(data.owner.toString(), accepted[0]);
    const result: any = await LaunchExternalEvent.findOne({
      userId: data.owner,
      externalEventId: 'meta:instagram:mapped-comment',
    });
    expect(result).toMatchObject({
      status: 'pending_review',
      association: {
        resolution: 'explicit_ids',
        launchId: data.launch._id,
        participantId: data.participant._id,
      },
    });
    expect(result.result.operation).toBe('none');
  });

  test('content mapping is owner-scoped, idempotent and cannot be reassigned', async () => {
    const data = await setup();
    const input = {
      platform: 'instagram' as const,
      accountId: 'ig-account-1',
      contentId: 'post-unique',
      actor: data.owner.toString(),
    };
    const first: any = await LaunchMetaContentService.link(
      data.owner.toString(),
      data.launch._id.toString(),
      input
    );
    const second: any = await LaunchMetaContentService.link(
      data.owner.toString(),
      data.launch._id.toString(),
      input
    );
    expect(first._id.toString()).toBe(second._id.toString());
    const other = await LaunchLifecycleService.createLaunch(data.owner.toString(), {
      name: 'Other',
      timezone: 'America/Bogota',
      idempotencyKey: 'other-meta-launch',
      actor: data.owner.toString(),
    });
    await expect(
      LaunchMetaContentService.link(data.owner.toString(), other._id.toString(), input)
    ).rejects.toMatchObject({ code: 'META_CONTENT_CONFLICT' });
    expect(await LaunchMetaContent.countDocuments()).toBe(1);
  });

  test('unmapped comment and ambiguous DM remain pending review without launch association', async () => {
    const data = await setup();
    await LaunchParticipant.deleteOne({ _id: data.participant._id });
    for (const payload of [
      MetaLaunchFixtures.instagramComment('unmapped'),
      MetaLaunchFixtures.instagramDm('ambiguous'),
    ]) {
      const result: any = await adapt(data, payload);
      expect(result.status).toBe('pending_review');
      expect(result.association.resolution).toBe('unresolved');
      expect(result.association.launchId).toBeUndefined();
    }
  });

  test('explicit participant token correlates a DM without relying on its text', async () => {
    const data = await setup();
    const token = 'meta-explicit-launch-token';
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      {
        $set: {
          'metadata.externalInboundTokenHash': createHash('sha256').update(token).digest('hex'),
        },
      }
    );
    const event = MetaWebhookNormalizer.normalizePayload(
      MetaLaunchFixtures.instagramDm('token-dm', { token })
    )[0];
    const result: any = await MetaLaunchAdapter.ingest(data.owner.toString(), event, {
      leadId: data.lead._id.toString(),
      conversationId: new mongoose.Types.ObjectId().toString(),
    });
    expect(result.association.participantId.toString()).toBe(data.participant._id.toString());
  });

  test('a mapping owned by another tenant cannot associate the event', async () => {
    const data = await setup();
    const other = await setup('instagram', 'ig-user-1', 'other-owner');
    await LaunchMetaContentService.link(data.owner.toString(), data.launch._id.toString(), {
      platform: 'instagram',
      accountId: 'ig-account-1',
      contentId: 'owner-post',
      actor: data.owner.toString(),
    });
    const payload = MetaLaunchFixtures.instagramComment('owner-isolation', 'owner-post');
    const result: any = await adapt(other, payload);
    expect(result).toMatchObject({
      status: 'pending_review',
      association: { resolution: 'unresolved', reason: 'explicit_launch_required' },
    });
  });

  test('confirmed multichannel identity resolves but unconfirmed identity does not', async () => {
    const data = await setup('facebook', 'original-facebook', 'identity');
    const contact: any = await ContactProfile.create({
      userId: data.owner,
      preferredChannel: 'facebook',
    });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { contactId: contact._id } }
    );
    const instagramLead: any = await Lead.create({
      userId: data.owner,
      username: 'ig-user-1',
      platform: 'instagram',
    });
    const instagramConversation: any = await Conversation.create({
      userId: data.owner,
      leadId: instagramLead._id,
      messages: [],
    });
    const identity: any = await ContactIdentity.create({
      userId: data.owner,
      contactId: contact._id,
      leadId: instagramLead._id,
      platform: 'instagram',
      externalId: 'ig-user-1',
      status: 'active',
      consentStatus: 'consented',
      confirmationSource: 'fixture',
    });
    await LaunchMetaContentService.link(data.owner.toString(), data.launch._id.toString(), {
      platform: 'instagram',
      accountId: 'ig-account-1',
      contentId: 'identity-post',
      actor: data.owner.toString(),
    });
    const event = MetaWebhookNormalizer.normalizePayload(
      MetaLaunchFixtures.instagramComment('identity-comment', 'identity-post')
    )[0];
    const resolved: any = await MetaLaunchAdapter.ingest(data.owner.toString(), event, {
      leadId: instagramLead._id.toString(),
      conversationId: instagramConversation._id.toString(),
    });
    expect(resolved.association.participantId.toString()).toBe(data.participant._id.toString());
    await ContactIdentity.updateOne({ _id: identity._id }, { $set: { status: 'unlinked' } });
    const second = {
      ...event,
      externalEventId: 'meta:instagram:identity-unconfirmed',
      commentId: 'identity-unconfirmed',
    };
    const unresolved: any = await MetaLaunchAdapter.ingest(data.owner.toString(), second, {
      leadId: instagramLead._id.toString(),
      conversationId: instagramConversation._id.toString(),
    });
    expect(unresolved.association.resolution).toBe('unresolved');
  });

  test('opt-out and terminal launch are ignored without creating L3 facts', async () => {
    const data = await setup();
    await Lead.updateOne({ _id: data.lead._id }, { $addToSet: { tags: 'opt_out' } });
    const ignored: any = await adapt(data, MetaLaunchFixtures.instagramDm('optout-dm'));
    expect(ignored).toMatchObject({
      status: 'ignored',
      association: { reason: 'lead_not_active' },
    });
    await Lead.updateOne({ _id: data.lead._id }, { $pull: { tags: 'opt_out' } });
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'cancelled' } });
    const terminal: any = await adapt(data, MetaLaunchFixtures.instagramDm('terminal-dm'));
    expect(terminal).toMatchObject({
      status: 'ignored',
      association: { reason: 'launch_not_active' },
    });
    expect(await LaunchEvent.countDocuments({ eventType: /registered|confirmed|attended/ })).toBe(
      0
    );
  });

  test('duplicates and concurrency create one external event and no L3 transition', async () => {
    const data = await setup();
    const payload = MetaLaunchFixtures.instagramDm('concurrent-dm');
    const results: any[] = await Promise.all([
      adapt(data, payload),
      adapt(data, payload),
      adapt(data, payload),
    ]);
    expect(new Set(results.map(item => item._id.toString())).size).toBe(1);
    expect(await LaunchExternalEvent.countDocuments()).toBe(1);
    expect(await LaunchEvent.countDocuments({ eventType: /registered|confirmed|attended/ })).toBe(
      0
    );
  });

  test('signature validation remains in the existing Meta webhook and stale events are rejected', async () => {
    process.env.META_APP_SECRET = 'l6c-meta-signing-secret';
    process.env.CRM_OWNER_ID = new mongoose.Types.ObjectId().toString();
    const payload = MetaLaunchFixtures.instagramComment('signed-meta');
    const body = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', process.env.META_APP_SECRET).update(body).digest('hex')}`;
    const accept = jest.spyOn(MetaIngestionService, 'acceptPayload').mockResolvedValue([]);
    const response: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };
    await MetaController.receive(
      {
        body,
        header: (name: string) => (name === 'x-hub-signature-256' ? signature : undefined),
      } as any,
      response
    );
    expect(response.sendStatus).toHaveBeenCalledWith(200);
    expect(accept).toHaveBeenCalledTimes(1);
    const invalid: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };
    await MetaController.receive({ body, header: () => 'sha256=invalid' } as any, invalid);
    expect(invalid.status).toHaveBeenCalledWith(401);
    accept.mockRestore();
    const stale: any = MetaLaunchFixtures.instagramComment('stale');
    stale.entry[0].changes[0].value.timestamp = Math.floor((Date.now() - 700000) / 1000);
    expect(await MetaIngestionService.acceptPayload(process.env.CRM_OWNER_ID, stale)).toHaveLength(
      0
    );
  });

  test('adapter creates zero outbound and calls neither MessagingService nor Graph API', async () => {
    process.env.META_MESSAGING_MODE = 'mock';
    process.env.INSTAGRAM_MESSAGING_MODE = 'mock';
    process.env.FACEBOOK_MESSAGING_MODE = 'mock';
    const send = jest.spyOn(MessagingService, 'send');
    const graph = jest.spyOn(MetaMessagingProvider.prototype, 'sendMessage');
    const data = await setup();
    await adapt(data, MetaLaunchFixtures.instagramDm('safe-inbound'));
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(graph).not.toHaveBeenCalled();
  });
});
