process.env.NODE_ENV = 'test';

import axios from 'axios';
import type http from 'http';
import { createHash } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import OutboundMessage from '../src/models/OutboundMessage';
import AssistedProposal from '../src/models/AssistedProposal';
import Task from '../src/models/Task';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchFormWebhookContract } from '../src/services/LaunchFormWebhookContract';
import { LaunchFormWebhookFixtures } from '../src/services/LaunchFormWebhookFixtures';
import { LaunchExternalEventService } from '../src/services/LaunchExternalEventService';
import { MessagingService } from '../src/services/MessagingService';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';
import { YouTubeMessagingProvider } from '../src/integrations/messaging/YouTubeMessagingProvider';

jest.setTimeout(120000);

describe('Launch L6B signed form webhook', () => {
  let mongo: MongoMemoryServer;
  let server: http.Server;
  let baseUrl: string;
  const secret = 'l6b-test-secret-with-at-least-32-characters';
  let requestSequence = 0;
  const originalWebhookEnvironment = {
    secret: process.env.LAUNCH_FORM_WEBHOOK_SECRET,
    owner: process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID,
    account: process.env.LAUNCH_FORM_WEBHOOK_ACCOUNT_ID,
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
      LaunchExternalEvent.syncIndexes(),
    ]);
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Test server unavailable');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchExternalEvent.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      Launch.deleteMany({}),
      Lead.deleteMany({}),
      Conversation.deleteMany({}),
      OutboundMessage.deleteMany({}),
      AssistedProposal.deleteMany({}),
      Task.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    await new Promise<void>(resolve => server.close(() => resolve()));
    await mongoose.disconnect();
    await mongo.stop();
    const restore = (key: string, value: string | undefined) => {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    };
    restore('LAUNCH_FORM_WEBHOOK_SECRET', originalWebhookEnvironment.secret);
    restore('LAUNCH_FORM_WEBHOOK_OWNER_ID', originalWebhookEnvironment.owner);
    restore('LAUNCH_FORM_WEBHOOK_ACCOUNT_ID', originalWebhookEnvironment.account);
  });

  const setup = async (owner = new mongoose.Types.ObjectId(), suffix = '') => {
    process.env.LAUNCH_FORM_WEBHOOK_SECRET = secret;
    process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID = owner.toString();
    process.env.LAUNCH_FORM_WEBHOOK_ACCOUNT_ID = 'l6b-controlled-form';
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: `L6B ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: ['manual'],
      registrationConfig: {
        requireRegistrationForConfirmation: true,
        confirmationFormIds: ['confirmation-form'],
      },
      idempotencyKey: `l6b-launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    await Launch.updateOne({ _id: launch._id }, { $set: { status: 'scheduled' } });
    launch.status = 'scheduled';
    const lead: any = await Lead.create({
      userId: owner,
      username: `l6b-${suffix || owner}`,
      platform: 'manual',
      currentChannel: 'manual',
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
      source: 'l6b-fixture',
      entryChannel: 'manual',
      evidence: { type: 'fixture', referenceId: `l6b-participant-${suffix}` },
      idempotencyKey: `l6b-participant-${suffix || owner}`,
      actor: owner.toString(),
    });
    return { owner, launch, lead, conversation, participant };
  };

  const post = async (
    dto: any,
    options: { signatureSecret?: string; headers?: Record<string, string>; ip?: string } = {}
  ) => {
    const signed = LaunchFormWebhookFixtures.signed(dto, options.signatureSecret ?? secret);
    requestSequence += 1;
    return axios.post(`${baseUrl}/api/v1/launches/inbound/form/webhook`, signed.rawBody, {
      headers: {
        ...signed.headers,
        'x-forwarded-for':
          options.ip || `10.10.${Math.floor(requestSequence / 250)}.${requestSequence % 250}`,
        ...options.headers,
      },
      validateStatus: () => true,
    });
  };

  test('accepts a valid signature and records registration with minimized L3 evidence', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    const response = await post(dto);
    expect(response.status).toBe(200);
    expect(response.data.data).toMatchObject({ status: 'processed', attempts: 1 });
    const participant: any = await LaunchParticipant.findById(data.participant._id);
    expect(participant.registration).toMatchObject({
      status: 'registered',
      evidence: {
        type: 'form',
        source: 'signed_form_webhook',
        referenceId: 'submission-registration-1',
      },
    });
    const external: any = await LaunchExternalEvent.findOne();
    expect(external.evidence.metadata).toEqual({
      provider: 'form',
      externalEventId: 'fixture-registration-1',
      method: 'registration_form',
      formId: 'registration-form',
      consentAcknowledged: true,
      sourceCode: 'l6b-fixture',
    });
    expect(external.toObject()).not.toHaveProperty('signature');
  });

  test('rejects invalid signatures without persisting an event', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    const response = await post(dto, { signatureSecret: 'wrong-secret' });
    expect(response.status).toBe(401);
    expect(await LaunchExternalEvent.countDocuments()).toBe(0);
  });

  test('rejects stale replay and mismatched signed timestamps', async () => {
    const data = await setup();
    const stale = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { timestamp: new Date(Date.now() - 600000).toISOString() }
    );
    expect((await post(stale)).status).toBe(409);
    const current = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect(
      (
        await post(current, {
          headers: { 'x-alma-timestamp': String(Math.floor(Date.now() / 1000) - 10) },
        })
      ).status
    ).toBe(401);
  });

  test('enforces the closed DTO, version and event-method correspondence', async () => {
    const data = await setup();
    const base: any = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect((await post({ ...base, schemaVersion: 2 })).status).toBe(400);
    expect((await post({ ...base, unexpected: 'not-allowed' })).status).toBe(400);
    expect(
      (await post({ ...base, eventType: 'confirmation', eventId: 'method-mismatch' })).status
    ).toBe(400);
    expect(await LaunchExternalEvent.countDocuments()).toBe(0);
  });

  test('confirmation requires prior registration and an explicitly configured form', async () => {
    const data = await setup();
    const register = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect((await post(register)).status).toBe(200);
    const confirm = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { eventType: 'confirmation', eventId: 'confirmation-1', idempotencyKey: 'confirmation-1' }
    );
    expect((await post(confirm)).status).toBe(200);
    expect((await LaunchParticipant.findById(data.participant._id))?.confirmation.status).toBe(
      'confirmed'
    );
    const other = await setup(new mongoose.Types.ObjectId(), 'unconfigured');
    process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID = other.owner.toString();
    await Launch.updateOne(
      { _id: other.launch._id },
      { $set: { 'registrationConfig.confirmationFormIds': [] } }
    );
    const ambiguous = LaunchFormWebhookFixtures.dto(
      other.launch._id.toString(),
      { participantId: other.participant._id.toString() },
      { eventType: 'confirmation', eventId: 'unconfigured', idempotencyKey: 'unconfigured' }
    );
    expect((await post(ambiguous)).status).toBe(202);
    expect((await LaunchExternalEvent.findOne({ externalEventId: 'unconfigured' }))?.status).toBe(
      'pending_review'
    );
  });

  test('interest is review-only and never becomes confirmation', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { leadId: data.lead._id.toString() },
      { eventType: 'interest', eventId: 'interest-1', idempotencyKey: 'interest-1' }
    );
    const response = await post(dto);
    expect(response.status).toBe(202);
    expect(response.data.data.status).toBe('pending_review');
    const participant = await LaunchParticipant.findById(data.participant._id);
    expect(participant?.registration.status).toBe('unknown');
    expect(participant?.confirmation.status).toBe('unknown');
  });

  test('resolves exact participant, lead or pre-generated token and nothing approximate', async () => {
    const data = await setup();
    const token = 'opaque-pre-generated-participant-token';
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      {
        $set: {
          'metadata.externalInboundTokenHash': createHash('sha256').update(token).digest('hex'),
        },
      }
    );
    const tokenDto = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantToken: token },
      { eventId: 'token-registration', idempotencyKey: 'token-registration' }
    );
    expect((await post(tokenDto)).status).toBe(200);
    const missing = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { leadId: new mongoose.Types.ObjectId().toString() },
      { eventType: 'interest', eventId: 'missing-lead', idempotencyKey: 'missing-lead' }
    );
    expect((await post(missing)).status).toBe(202);
    expect((await LaunchExternalEvent.findOne({ externalEventId: 'missing-lead' }))?.status).toBe(
      'pending_review'
    );
    const nonexistentParticipant = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: new mongoose.Types.ObjectId().toString() },
      { eventId: 'missing-participant', idempotencyKey: 'missing-participant' }
    );
    expect((await post(nonexistentParticipant)).status).toBe(202);
    expect(
      await LaunchExternalEvent.findOne({ externalEventId: 'missing-participant' })
    ).toMatchObject({
      status: 'pending_review',
      association: { reason: 'participant_not_found_for_owner_launch' },
    });
  });

  test('owner and launch isolation prevent cross-tenant updates', async () => {
    const data = await setup();
    const foreign = await setup(new mongoose.Types.ObjectId(), 'foreign');
    process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID = data.owner.toString();
    const dto = LaunchFormWebhookFixtures.dto(foreign.launch._id.toString(), {
      participantId: foreign.participant._id.toString(),
    });
    const response = await post(dto);
    expect(response.status).toBe(202);
    expect((await LaunchExternalEvent.findOne())?.get('association.reason')).toBe(
      'participant_not_found_for_owner_launch'
    );
    expect((await LaunchParticipant.findById(foreign.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });

  test('terminal, opted-out and cancelled participants are safely ignored', async () => {
    const data = await setup();
    await Lead.updateOne({ _id: data.lead._id }, { $addToSet: { tags: 'opt_out' } });
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect((await post(dto)).status).toBe(202);
    expect(await LaunchExternalEvent.findOne({ externalEventId: dto.eventId })).toMatchObject({
      status: 'ignored',
      association: { reason: 'lead_not_active' },
    });
    await Lead.updateOne({ _id: data.lead._id }, { $pull: { tags: 'opt_out' } });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'registration.status': 'cancelled' } }
    );
    const cancelled = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { eventId: 'cancelled-participant', idempotencyKey: 'cancelled-participant' }
    );
    expect((await post(cancelled)).status).toBe(202);
    expect(
      await LaunchExternalEvent.findOne({ externalEventId: 'cancelled-participant' })
    ).toMatchObject({
      status: 'ignored',
      association: { reason: 'participant_registration_cancelled' },
    });
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'cancelled' } });
    const terminal = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { eventId: 'terminal-launch', idempotencyKey: 'terminal-launch' }
    );
    expect((await post(terminal)).status).toBe(202);
    expect(await LaunchExternalEvent.findOne({ externalEventId: 'terminal-launch' })).toMatchObject(
      {
        status: 'ignored',
        association: { reason: 'launch_not_active' },
      }
    );
  });

  test('exact and concurrent duplicates apply one registration and one LaunchEvent', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    const responses = await Promise.all([post(dto), post(dto), post(dto)]);
    expect(responses.every(response => [200, 202].includes(response.status))).toBe(true);
    expect(await LaunchExternalEvent.countDocuments()).toBe(1);
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_registered' })).toBe(
      1
    );
  });

  test('same eventId with a different payload is a conflict', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect((await post(dto)).status).toBe(200);
    const changed = {
      ...dto,
      form: { ...dto.form, submissionId: 'changed-submission' },
    };
    const response = await post(changed);
    expect(response.status).toBe(409);
    expect(response.data.code).toBe('EXTERNAL_EVENT_PAYLOAD_CONFLICT');
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_registered' })).toBe(
      1
    );
  });

  test('failed confirmation can be retried after registration without duplication', async () => {
    const data = await setup();
    const confirmation = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { eventType: 'confirmation', eventId: 'retry-confirm', idempotencyKey: 'retry-confirm' }
    );
    expect((await post(confirmation)).status).toBe(500);
    const registration = LaunchFormWebhookFixtures.dto(
      data.launch._id.toString(),
      { participantId: data.participant._id.toString() },
      { eventId: 'retry-register', idempotencyKey: 'retry-register' }
    );
    expect((await post(registration)).status).toBe(200);
    expect((await post(confirmation)).status).toBe(200);
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_confirmed' })).toBe(1);
    expect(
      (await LaunchExternalEvent.findOne({ externalEventId: 'retry-confirm' }))?.attempts
    ).toBe(2);
  });

  test('rejects payloads above the configured raw-body limit', async () => {
    const data = await setup();
    const dto: any = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    dto.padding = 'x'.repeat(70000);
    const response = await post(dto);
    expect(response.status).toBe(413);
    expect(await LaunchExternalEvent.countDocuments()).toBe(0);
  });

  test('rate limits the inbound endpoint independently', async () => {
    const savedSecret = process.env.LAUNCH_FORM_WEBHOOK_SECRET;
    delete process.env.LAUNCH_FORM_WEBHOOK_SECRET;
    const data = await setup();
    delete process.env.LAUNCH_FORM_WEBHOOK_SECRET;
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    const statuses = [];
    for (let index = 0; index < 31; index += 1)
      statuses.push((await post(dto, { ip: '203.0.113.77' })).status);
    expect(statuses.slice(0, 30).every(status => status === 503)).toBe(true);
    expect(statuses[30]).toBe(429);
    process.env.LAUNCH_FORM_WEBHOOK_SECRET = savedSecret;
  });

  test('creates zero outbound and calls no messaging or external provider', async () => {
    const send = jest.spyOn(MessagingService, 'send');
    const meta = jest.spyOn(MetaMessagingProvider.prototype, 'sendMessage');
    const youtube = jest.spyOn(YouTubeMessagingProvider.prototype, 'sendMessage');
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    expect((await post(dto)).status).toBe(200);
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(await AssistedProposal.countDocuments()).toBe(0);
    expect(await Task.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(meta).not.toHaveBeenCalled();
    expect(youtube).not.toHaveBeenCalled();
  });

  test('contract fixture can be exercised without any HTTP infrastructure', async () => {
    const data = await setup();
    const dto = LaunchFormWebhookFixtures.dto(data.launch._id.toString(), {
      participantId: data.participant._id.toString(),
    });
    const parsed = LaunchFormWebhookContract.parse(dto);
    const event = LaunchFormWebhookContract.toExternalEvent(
      parsed,
      data.owner.toString(),
      'fixture-account',
      300000
    );
    expect((await LaunchExternalEventService.ingest(event)).status).toBe('processed');
  });
});
