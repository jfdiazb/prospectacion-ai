import { createHash, createHmac } from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import IdentityAudit from '../src/models/IdentityAudit';
import LaunchAction from '../src/models/LaunchAction';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { WhatsAppInboundNormalizer } from '../src/services/WhatsAppInboundNormalizer';
import { WhatsAppLaunchAdapter } from '../src/services/WhatsAppLaunchAdapter';
import { WhatsAppLaunchFixtures } from '../src/services/WhatsAppLaunchFixtures';
import { WhatsAppOptOutService } from '../src/services/WhatsAppOptOutService';
import { WhatsAppController } from '../src/controllers/WhatsAppController';
import { MessagingService } from '../src/services/MessagingService';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';

describe('Launch L6D WhatsApp mock inbound adapter', () => {
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
      InboundEvent.syncIndexes(),
    ]);
  });
  beforeEach(() => {
    process.env.WHATSAPP_MESSAGING_MODE = 'mock';
    process.env.WHATSAPP_AUTO_REPLY_ENABLED = 'false';
    process.env.WHATSAPP_REPLY_MODE = 'assisted';
    process.env.WHATSAPP_APP_SECRET = 'l6d-whatsapp-test-secret';
    process.env.WHATSAPP_PHONE_NUMBER_ID = 'phone-number-1';
    process.env.WHATSAPP_ACTIVATION_ALLOWLIST = '';
    process.env.AI_MODE = 'mock';
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      LaunchExternalEvent.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchAction.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      Launch.deleteMany({}),
      InboundEvent.deleteMany({}),
      AssistedProposal.deleteMany({}),
      OutboundMessage.deleteMany({}),
      IdentityAudit.deleteMany({}),
      ContactIdentity.deleteMany({}),
      ContactProfile.deleteMany({}),
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
    process.env.CRM_OWNER_ID = owner.toString();
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: `WhatsApp launch ${suffix}`,
      timezone: 'America/Bogota',
      allowedChannels: ['whatsapp'],
      registrationConfig: {
        requireRegistrationForConfirmation: true,
        whatsappInteractiveActions: ['registration', 'confirmation'],
      },
      idempotencyKey: `wa-launch-${suffix || owner}`,
      actor: owner.toString(),
    });
    await Launch.updateOne({ _id: launch._id }, { $set: { status: 'scheduled' } });
    launch.status = 'scheduled';
    const lead: any = await Lead.create({
      userId: owner,
      username: '573001112233',
      phone: '573001112233',
      platform: 'whatsapp',
      currentChannel: 'whatsapp',
      status: 'interested',
    });
    const conversation: any = await Conversation.create({
      userId: owner,
      leadId: lead._id,
      messages: [],
    });
    const token = `safe_token_${new mongoose.Types.ObjectId().toString()}`;
    const participant: any = await LaunchLifecycleService.addParticipant(owner.toString(), {
      launchId: launch._id.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation._id.toString(),
      source: 'l6d-fixture',
      entryChannel: 'whatsapp',
      evidence: { type: 'fixture', referenceId: `wa-participant-${suffix}` },
      idempotencyKey: `wa-participant-${suffix || owner}`,
      actor: owner.toString(),
      metadata: { externalInboundTokenHash: createHash('sha256').update(token).digest('hex') },
    });
    return { owner, launch, lead, conversation, participant, token };
  };
  const normalized = (message: any) => {
    const event = WhatsAppInboundNormalizer.normalize(message, WhatsAppLaunchFixtures.metadata());
    if (!event) throw new Error('Fixture did not normalize');
    return event;
  };
  const adapt = (data: any, message: any, conversationId = data.conversation._id.toString()) =>
    WhatsAppLaunchAdapter.ingest(data.owner.toString(), normalized(message), {
      leadId: data.lead._id.toString(),
      conversationId,
    });

  test('normalizes inbound text, button, list and safe media metadata', () => {
    const launchId = new mongoose.Types.ObjectId().toString(),
      token = 'safe_token_abcdefghijklmnop';
    expect(normalized(WhatsAppLaunchFixtures.text('text-1'))).toMatchObject({
      messageType: 'text',
      waId: '573001112233',
    });
    expect(
      normalized(
        WhatsAppLaunchFixtures.button(
          'button-1',
          WhatsAppLaunchFixtures.control('registration', launchId, token)
        )
      )
    ).toMatchObject({ messageType: 'button_reply', action: { action: 'registration', launchId } });
    expect(
      normalized(
        WhatsAppLaunchFixtures.list(
          'list-1',
          WhatsAppLaunchFixtures.control('confirmation', launchId, token)
        )
      )
    ).toMatchObject({ messageType: 'list_reply', action: { action: 'confirmation', launchId } });
    expect(normalized(WhatsAppLaunchFixtures.media('media-1'))).toMatchObject({
      messageType: 'media',
      media: { type: 'image', mimeType: 'image/jpeg' },
    });
  });

  test('existing signed webhook feeds text into LaunchExternalEvent without auto reply', async () => {
    const data = await setup('webhook');
    const payload = WhatsAppLaunchFixtures.payload(WhatsAppLaunchFixtures.text('webhook-text'));
    const body = Buffer.from(JSON.stringify(payload));
    const signature = `sha256=${createHmac('sha256', process.env.WHATSAPP_APP_SECRET!).update(body).digest('hex')}`;
    const res: any = {
      sendStatus: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    await WhatsAppController.receiveMessage({ body, header: () => signature } as any, res);
    expect(res.sendStatus).toHaveBeenCalledWith(200);
    expect(await InboundEvent.countDocuments({ externalEventId: 'webhook-text' })).toBe(1);
    expect(
      await LaunchExternalEvent.findOne({ externalEventId: 'whatsapp:webhook-text' })
    ).toMatchObject({
      provider: 'whatsapp',
      status: 'pending_review',
      association: { resolution: 'explicit_ids' },
    });
    expect(process.env.WHATSAPP_AUTO_REPLY_ENABLED).toBe('false');
  });

  test('free text and visible yes never register or confirm', async () => {
    const data = await setup();
    for (const [id, text] of [
      ['free-info', 'INFO'],
      ['free-yes', 'sí'],
    ]) {
      const result: any = await adapt(data, WhatsAppLaunchFixtures.text(id, text));
      expect(result).toMatchObject({ status: 'pending_review', eventType: 'direct_message' });
    }
    const participant = await LaunchParticipant.findById(data.participant._id);
    expect(participant?.registration.status).toBe('unknown');
    expect(participant?.confirmation.status).toBe('unknown');
  });

  test('authorized button registration and list confirmation reuse L3', async () => {
    const data = await setup();
    const registration = WhatsAppLaunchFixtures.button(
      'register-button',
      WhatsAppLaunchFixtures.control('registration', data.launch._id.toString(), data.token)
    );
    const registered: any = await adapt(
      data,
      registration,
      new mongoose.Types.ObjectId().toString()
    );
    expect(registered).toMatchObject({
      status: 'processed',
      result: { operation: 'register', state: 'registered' },
    });
    const confirmation = WhatsAppLaunchFixtures.list(
      'confirm-list',
      WhatsAppLaunchFixtures.control('confirmation', data.launch._id.toString(), data.token)
    );
    const confirmed: any = await adapt(
      data,
      confirmation,
      new mongoose.Types.ObjectId().toString()
    );
    expect(confirmed).toMatchObject({
      status: 'processed',
      result: { operation: 'confirm', state: 'confirmed' },
    });
    expect(
      await LaunchEvent.countDocuments({
        eventType: { $in: ['launch.participant_registered', 'launch.participant_confirmed'] },
      })
    ).toBe(2);
  });

  test('valid token associates while invalid token remains pending review', async () => {
    const data = await setup();
    const valid: any = await adapt(
      data,
      WhatsAppLaunchFixtures.button(
        'valid-token',
        WhatsAppLaunchFixtures.control('interaction', data.launch._id.toString(), data.token)
      ),
      new mongoose.Types.ObjectId().toString()
    );
    expect(valid.association.participantId.toString()).toBe(data.participant._id.toString());
    const invalid: any = await adapt(
      data,
      WhatsAppLaunchFixtures.button(
        'invalid-token',
        WhatsAppLaunchFixtures.control(
          'interaction',
          data.launch._id.toString(),
          'invalid_token_abcdefghijkl'
        )
      ),
      new mongoose.Types.ObjectId().toString()
    );
    expect(invalid).toMatchObject({
      status: 'pending_review',
      association: {
        resolution: 'unresolved',
        reason: 'deterministic_participant_reference_required',
      },
    });
  });

  test('linked conversation associates and an unlinked conversation remains ambiguous', async () => {
    const data = await setup();
    const linked: any = await adapt(data, WhatsAppLaunchFixtures.text('linked'));
    expect(linked.association.participantId.toString()).toBe(data.participant._id.toString());
    const ambiguous: any = await adapt(
      data,
      WhatsAppLaunchFixtures.text('ambiguous'),
      new mongoose.Types.ObjectId().toString()
    );
    expect(ambiguous).toMatchObject({
      status: 'pending_review',
      association: { resolution: 'unresolved', reason: 'explicit_launch_required' },
    });
  });

  test('unconfigured interactive action is weak and cannot create an L3 fact', async () => {
    const data = await setup();
    await Launch.updateOne(
      { _id: data.launch._id },
      { $set: { 'registrationConfig.whatsappInteractiveActions': [] } }
    );
    const result: any = await adapt(
      data,
      WhatsAppLaunchFixtures.button(
        'not-authorized',
        WhatsAppLaunchFixtures.control('registration', data.launch._id.toString(), data.token)
      )
    );
    expect(result).toMatchObject({
      status: 'pending_review',
      eventType: 'direct_message',
      metadata: { actionAuthorized: false },
    });
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });

  test('owner isolation prevents use of a foreign token', async () => {
    const data = await setup('owner-a');
    const foreignOwner = new mongoose.Types.ObjectId();
    const message = WhatsAppLaunchFixtures.button(
      'foreign-token',
      WhatsAppLaunchFixtures.control('registration', data.launch._id.toString(), data.token)
    );
    const event = normalized(message);
    const result: any = await WhatsAppLaunchAdapter.ingest(foreignOwner.toString(), event, {
      leadId: data.lead._id.toString(),
      conversationId: data.conversation._id.toString(),
    });
    expect(result.status).toBe('pending_review');
    expect((await LaunchParticipant.findById(data.participant._id))?.registration.status).toBe(
      'unknown'
    );
  });

  test('explicit opt-out is durable and invalidates proposals across confirmed identities', async () => {
    const data = await setup();
    const contact: any = await ContactProfile.create({
      userId: data.owner,
      preferredChannel: 'whatsapp',
    });
    await ContactIdentity.create({
      userId: data.owner,
      contactId: contact._id,
      leadId: data.lead._id,
      platform: 'whatsapp',
      externalId: data.lead.phone,
      consentStatus: 'consented',
      confirmationSource: 'fixture',
    });
    const otherLead: any = await Lead.create({
      userId: data.owner,
      username: 'ig-linked',
      platform: 'instagram',
    });
    const otherConversation: any = await Conversation.create({
      userId: data.owner,
      leadId: otherLead._id,
      messages: [],
    });
    await ContactIdentity.create({
      userId: data.owner,
      contactId: contact._id,
      leadId: otherLead._id,
      platform: 'instagram',
      externalId: 'ig-linked',
      consentStatus: 'consented',
      confirmationSource: 'fixture',
    });
    await AssistedProposal.create({
      userId: data.owner,
      leadId: otherLead._id,
      conversationId: otherConversation._id,
      sourceEventId: 'cross-channel-proposal',
      platform: 'instagram',
      text: 'No enviar',
      originalText: 'No enviar',
      status: 'proposed',
    });
    expect(WhatsAppOptOutService.matches('No quiero continuar, no me contactes')).toBe(true);
    await WhatsAppOptOutService.apply(
      data.owner.toString(),
      data.lead._id.toString(),
      'optout-event',
      new Date()
    );
    expect(await Lead.findById(data.lead._id)).toMatchObject({
      status: 'rejected',
      tags: expect.arrayContaining(['opt_out']),
    });
    expect(await ContactProfile.findById(contact._id)).toMatchObject({ generalOptOut: true });
    expect(
      await AssistedProposal.findOne({ sourceEventId: 'cross-channel-proposal' })
    ).toMatchObject({ status: 'cancelled', invalidationReason: 'general_opt_out' });
    expect((await LaunchParticipant.findById(data.participant._id))?.stage.status).toBe(
      'opted_out'
    );
  });

  test('terminal launch and cancelled participant are ignored', async () => {
    const data = await setup();
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'registration.status': 'cancelled' } }
    );
    const cancelled: any = await adapt(data, WhatsAppLaunchFixtures.text('cancelled'));
    expect(cancelled).toMatchObject({
      status: 'ignored',
      association: { reason: 'participant_registration_cancelled' },
    });
    await LaunchParticipant.updateOne(
      { _id: data.participant._id },
      { $set: { 'registration.status': 'unknown' } }
    );
    await Launch.updateOne({ _id: data.launch._id }, { $set: { status: 'cancelled' } });
    const terminal: any = await adapt(data, WhatsAppLaunchFixtures.text('terminal'));
    expect(terminal).toMatchObject({
      status: 'ignored',
      association: { reason: 'launch_not_active' },
    });
  });

  test('duplicates and concurrency create one event and one registration', async () => {
    const data = await setup();
    const message = WhatsAppLaunchFixtures.button(
      'concurrent-register',
      WhatsAppLaunchFixtures.control('registration', data.launch._id.toString(), data.token)
    );
    const results: any[] = await Promise.all([
      adapt(data, message),
      adapt(data, message),
      adapt(data, message),
    ]);
    expect(new Set(results.map(item => item._id.toString())).size).toBe(1);
    expect(await LaunchExternalEvent.countDocuments()).toBe(1);
    expect(await LaunchEvent.countDocuments({ eventType: 'launch.participant_registered' })).toBe(
      1
    );
  });

  test('invalid signature is rejected before persistence', async () => {
    await setup();
    const body = Buffer.from(
      JSON.stringify(WhatsAppLaunchFixtures.payload(WhatsAppLaunchFixtures.text('bad-signature')))
    );
    const res: any = { sendStatus: jest.fn().mockReturnThis() };
    await WhatsAppController.receiveMessage({ body, header: () => 'sha256=invalid' } as any, res);
    expect(res.sendStatus).toHaveBeenCalledWith(401);
    expect(await InboundEvent.countDocuments()).toBe(0);
    expect(await LaunchExternalEvent.countDocuments()).toBe(0);
  });

  test('adapter creates zero outbound and calls neither MessagingService nor Cloud API', async () => {
    const send = jest.spyOn(MessagingService, 'send');
    const cloud = jest.spyOn(MetaMessagingProvider.prototype, 'sendMessage');
    const data = await setup();
    await adapt(data, WhatsAppLaunchFixtures.text('safe-inbound'));
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect(cloud).not.toHaveBeenCalled();
    expect(process.env.WHATSAPP_MESSAGING_MODE).toBe('mock');
    expect(process.env.WHATSAPP_AUTO_REPLY_ENABLED).toBe('false');
  });
});
