import { createHmac } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import Task from '../src/models/Task';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchExternalEventContract } from '../src/services/LaunchExternalEventContract';
import { LaunchExternalEventFixtures } from '../src/services/LaunchExternalEventFixtures';
import { LaunchExternalEventService } from '../src/services/LaunchExternalEventService';
import { MessagingService } from '../src/services/MessagingService';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';
import { YouTubeMessagingProvider } from '../src/integrations/messaging/YouTubeMessagingProvider';

describe('Launch L6A external event contracts', () => {
  let mongo: MongoMemoryServer;
  const now = new Date('2027-11-10T12:00:00Z');
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      LaunchExternalEvent.syncIndexes(),
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
    ]);
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchExternalEvent.deleteMany({}),
      Launch.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      LaunchEvent.deleteMany({}),
      Lead.deleteMany({}),
      Conversation.deleteMany({}),
      Task.deleteMany({}),
      AssistedProposal.deleteMany({}),
      OutboundMessage.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  const setup = async (owner = new mongoose.Types.ObjectId(), suffix = '') => {
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: `External ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: ['whatsapp', 'instagram', 'facebook', 'youtube', 'tiktok', 'manual'],
      registrationConfig: { requireRegistrationForConfirmation: true },
      idempotencyKey: `launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    const lead: any = await Lead.create({
      userId: owner,
      username: `external-${suffix}`,
      platform: 'whatsapp',
      currentChannel: 'whatsapp',
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
      source: 'fixture',
      entryChannel: 'whatsapp',
      evidence: { type: 'fixture', referenceId: `participant-${suffix}` },
      idempotencyKey: `participant-${suffix || owner}`,
      actor: owner.toString(),
    });
    const refs = {
      launchId: launch._id.toString(),
      participantId: participant._id.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      referenceId: `ref-${suffix || 'one'}`,
    };
    return { owner, launch, lead, conversation, participant, refs };
  };
  const registration = (data: any, provider: any = 'event_provider', id = 'registration-1') =>
    LaunchExternalEventFixtures.event(provider, data.owner.toString(), {
      eventType: 'registration',
      externalEventId: id,
      providerTimestamp: now,
      receivedAt: now,
      normalizedPayload: {
        ...data.refs,
        registrationStatus: 'registered',
        contentType: 'provider_event',
      },
      evidence: {
        type: 'provider',
        source: `${provider}_mock`,
        channel:
          provider === 'meta' ? 'instagram' : provider === 'whatsapp' ? 'whatsapp' : 'manual',
        referenceId: id,
      },
    });

  test('normalizes the versioned minimal contract and rejects unsupported versions', async () => {
    const data = await setup();
    const normalized = LaunchExternalEventContract.normalize(registration(data), now);
    expect(normalized).toMatchObject({
      schemaVersion: 1,
      provider: 'event_provider',
      eventType: 'registration',
      correlationKey: 'event_provider:event_provider-account:registration-1',
    });
    expect(normalized.providerTimestamp).toBeInstanceOf(Date);
    expect(() =>
      LaunchExternalEventContract.normalize({ ...registration(data), schemaVersion: 2 } as any, now)
    ).toThrow(/Versión/);
  });
  test('rejects invalid events, failed verification and oversized metadata', async () => {
    const data = await setup();
    expect(() =>
      LaunchExternalEventContract.normalize({ ...registration(data), externalEventId: '' }, now)
    ).toThrow(/Identidad/);
    expect(() =>
      LaunchExternalEventContract.normalize(
        { ...registration(data), verification: { status: 'failed' } },
        now
      )
    ).toThrow(/Verificación/);
    expect(() =>
      LaunchExternalEventContract.normalize(
        { ...registration(data), metadata: { value: 'x'.repeat(5000) } },
        now
      )
    ).toThrow(/Metadata/);
  });
  test('verifies HMAC without exposing or storing a secret', () => {
    const secret = 'fixture-secret',
      body = '{"event":"demo"}',
      signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(LaunchExternalEventContract.verifyHmac(body, signature, secret)).toBe(true);
    expect(LaunchExternalEventContract.verifyHmac(body, signature, 'wrong')).toBe(false);
    expect(LaunchExternalEventContract.verifyHmac(body, undefined, secret)).toBe(false);
  });
  test('rejects stale replay before persistence', async () => {
    const data = await setup();
    const stale = registration(data);
    stale.providerTimestamp = new Date(now.getTime() - 600000);
    await expect(LaunchExternalEventService.ingest(stale, now)).rejects.toMatchObject({
      code: 'EXTERNAL_EVENT_REPLAY',
    });
    expect(await LaunchExternalEvent.countDocuments()).toBe(0);
  });
  test('processes deterministic registration once and reuses L3 evidence', async () => {
    const data = await setup();
    const event: any = await LaunchExternalEventService.ingest(registration(data), now);
    expect(event).toMatchObject({
      status: 'processed',
      attempts: 1,
      association: { resolution: 'explicit_ids' },
      result: { operation: 'register', state: 'registered' },
    });
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'registered'
    );
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_registered' })).toBe(
      1
    );
  });
  test('duplicate and concurrent deliveries do not duplicate transitions or audit', async () => {
    const data = await setup();
    const input = registration(data);
    const [one, two, three]: any[] = await Promise.all([
      LaunchExternalEventService.ingest(input, now),
      LaunchExternalEventService.ingest(input, now),
      LaunchExternalEventService.ingest(input, now),
    ]);
    expect(new Set([one._id.toString(), two._id.toString(), three._id.toString()]).size).toBe(1);
    expect(await LaunchExternalEvent.countDocuments()).toBe(1);
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_registered' })).toBe(
      1
    );
  });
  test('failed strong event can be retried safely after its prerequisite exists', async () => {
    const data = await setup();
    const confirmation = LaunchExternalEventFixtures.event('form', data.owner.toString(), {
      eventType: 'confirmation',
      externalEventId: 'confirm-retry',
      providerTimestamp: now,
      receivedAt: now,
      normalizedPayload: { ...data.refs, confirmationStatus: 'confirmed', contentType: 'form' },
      evidence: {
        type: 'form',
        source: 'form_mock',
        channel: 'manual',
        referenceId: 'confirm-retry',
      },
    });
    const failed: any = await LaunchExternalEventService.ingest(confirmation, now);
    expect(failed).toMatchObject({ status: 'failed', error: { code: 'REGISTRATION_REQUIRED' } });
    await LaunchExternalEventService.ingest(
      registration(data, 'event_provider', 'registration-prerequisite'),
      now
    );
    const retried: any = await LaunchExternalEventService.retry(
      data.owner.toString(),
      failed._id.toString(),
      new Date(now.getTime() + 1000)
    );
    expect(retried).toMatchObject({
      status: 'processed',
      attempts: 2,
      result: { operation: 'confirm', state: 'confirmed' },
    });
  });
  test('missing explicit IDs stays pending_review and never associates by text or name', async () => {
    const data = await setup();
    const input = LaunchExternalEventFixtures.meta(data.owner.toString(), {
      eventType: 'comment',
      externalEventId: 'comment-guess',
      providerTimestamp: now,
      receivedAt: now,
      externalParticipantId: data.lead.username,
      normalizedPayload: { contentType: 'comment', referenceId: 'comment-guess' },
      metadata: { textHint: data.launch.name },
    });
    const event: any = await LaunchExternalEventService.ingest(input, now);
    expect(event.status).toBe('pending_review');
    expect(event.association.toObject()).toMatchObject({
      resolution: 'unresolved',
      reason: 'explicit_launch_required',
    });
    expect(event.association.launchId).toBeUndefined();
  });
  test('weak interactions remain pending review even with deterministic association', async () => {
    const data = await setup();
    for (const eventType of [
      'comment',
      'direct_message',
      'form_submit',
      'click',
      'provider_event',
    ] as const) {
      const input = LaunchExternalEventFixtures.meta(data.owner.toString(), {
        eventType,
        externalEventId: `weak-${eventType}`,
        providerTimestamp: now,
        receivedAt: now,
        normalizedPayload: {
          ...data.refs,
          contentType:
            eventType === 'direct_message'
              ? 'direct_message'
              : eventType === 'form_submit'
                ? 'form'
                : eventType === 'click'
                  ? 'click'
                  : eventType === 'comment'
                    ? 'comment'
                    : 'provider_event',
        },
        evidence: {
          type: 'webhook',
          source: 'meta_mock',
          channel: 'instagram',
          referenceId: `weak-${eventType}`,
        },
      });
      const result: any = await LaunchExternalEventService.ingest(input, now);
      expect(result).toMatchObject({
        status: 'pending_review',
        result: { state: 'weak_interaction_requires_review' },
      });
    }
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });
  test('owner isolation and relationship mismatch cannot update a participant', async () => {
    const data = await setup(),
      foreign = await setup(new mongoose.Types.ObjectId(), 'foreign');
    const input = registration(data);
    input.ownerId = foreign.owner.toString();
    input.externalEventId = 'foreign-owner';
    input.correlationKey = 'foreign-owner';
    const result: any = await LaunchExternalEventService.ingest(input, now);
    expect(result).toMatchObject({
      status: 'pending_review',
      association: { reason: 'participant_not_found_for_owner_launch' },
    });
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });
  test.each(['meta', 'whatsapp', 'youtube', 'tiktok', 'form', 'event_provider'] as const)(
    '%s mock adapter preserves provider and safe channel',
    async provider => {
      const data = await setup(new mongoose.Types.ObjectId(), provider);
      const input = LaunchExternalEventFixtures.event(provider, data.owner.toString(), {
        externalEventId: `${provider}-mock`,
        providerTimestamp: now,
        receivedAt: now,
      });
      const event: any = await LaunchExternalEventService.ingest(input, now);
      expect(event.provider).toBe(provider);
      expect(event.status).toBe('pending_review');
      expect(event.metadata.fixture).toBe(true);
    }
  );
  test('TikTok keeps its channel, invents no DM or recipient and remains review-only', async () => {
    const data = await setup();
    const input = LaunchExternalEventFixtures.tiktok(data.owner.toString(), {
      eventType: 'comment',
      externalEventId: 'tiktok-comment',
      providerTimestamp: now,
      receivedAt: now,
      normalizedPayload: { ...data.refs, contentType: 'comment', referenceId: 'tiktok-comment' },
      evidence: {
        type: 'provider',
        source: 'tiktok_mock',
        channel: 'tiktok',
        referenceId: 'tiktok-comment',
      },
    });
    const event: any = await LaunchExternalEventService.ingest(input, now);
    expect(event).toMatchObject({
      provider: 'tiktok',
      channel: 'tiktok',
      eventType: 'comment',
      status: 'pending_review',
    });
    expect(event.normalizedPayload.recipient).toBeUndefined();
    expect(event.normalizedPayload.contentType).not.toBe('direct_message');
  });
  test('all L6A processing creates zero outbound and calls no messaging provider', async () => {
    const send = jest.spyOn(MessagingService, 'send'),
      meta = jest.spyOn(MetaMessagingProvider.prototype, 'sendMessage'),
      youtube = jest.spyOn(YouTubeMessagingProvider.prototype, 'sendMessage');
    const data = await setup();
    await LaunchExternalEventService.ingest(
      registration(data, 'whatsapp', 'safe-zero-outbound'),
      now
    );
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(await AssistedProposal.countDocuments()).toBe(0);
    expect(await Task.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(meta).not.toHaveBeenCalled();
    expect(youtube).not.toHaveBeenCalled();
  });
});
