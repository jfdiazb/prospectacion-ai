import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import InboundEvent from '../src/models/InboundEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import LaunchExternalEvent from '../src/models/LaunchExternalEvent';
import LaunchMetaContent from '../src/models/LaunchMetaContent';
import { MetaWebhookNormalizer } from '../src/integrations/meta';
import { MetaIngestionService } from '../src/services/MetaIngestionService';
import { MetaController } from '../src/controllers/MetaController';
import * as aiIntegrations from '../src/integrations/ai';

const instagramComment = (id: string, text = 'Quiero más información', sender = 'ig-user') => ({
  object: 'instagram',
  entry: [
    {
      changes: [
        {
          field: 'comments',
          value: {
            id,
            text,
            from: { id: sender },
            platform: 'instagram',
            media: { id: 'ig-media' },
            permalink_url: 'https://www.instagram.com/p/demo/',
          },
        },
      ],
    },
  ],
});
const facebookComment = (id: string, text = 'Me interesa', sender = 'fb-user') => ({
  object: 'page',
  entry: [
    {
      changes: [
        {
          field: 'comments',
          value: { id, text, from: { id: sender }, platform: 'facebook', post_id: 'fb-post' },
        },
      ],
    },
  ],
});

describe('Phase 4 Meta consolidation', () => {
  let mongo: MongoMemoryServer;
  let ownerA: mongoose.Types.ObjectId;
  let ownerB: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  });
  beforeEach(() => {
    ownerA = new mongoose.Types.ObjectId();
    ownerB = new mongoose.Types.ObjectId();
    delete process.env.META_INITIAL_INTENT_PHRASES;
  });
  afterEach(async () => {
    jest.restoreAllMocks();
    await Promise.all([
      InboundEvent.deleteMany({}),
      LaunchExternalEvent.deleteMany({}),
      LaunchMetaContent.deleteMany({}),
      Lead.deleteMany({}),
      Conversation.deleteMany({}),
      AssistedProposal.deleteMany({}),
      OutboundMessage.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test.each([
    'INFO',
    'Info',
    'quiero información',
    'MÁS INFORMACIÓN',
    'me interesa',
    'informacion',
  ])('detects configurable initial intent: %s', text => {
    expect(MetaWebhookNormalizer.matchesInitialIntent(text)).toBe(true);
  });

  test('supports configured phrases without partial-word matches', () => {
    process.env.META_INITIAL_INTENT_PHRASES = 'asesoría personalizada';
    expect(MetaWebhookNormalizer.matchesInitialIntent('Quiero asesoría personalizada')).toBe(true);
    expect(MetaWebhookNormalizer.matchesInitialIntent('informacion')).toBe(false);
    expect(MetaWebhookNormalizer.matchesInitialIntent('desinformacion')).toBe(false);
  });

  test.each([
    'Busco una oportunidad de negocio',
    'Necesito ingresos adicionales',
    'Quiero emprender',
    'Productos Nutrilite',
    'Como funciona Amway',
  ])('detects broader commercial intent: %s', text =>
    expect(MetaWebhookNormalizer.matchesInitialIntent(text)).toBe(true)
  );

  test('normalizes Instagram comments and Facebook Messenger DMs with distinct recipients', () => {
    const ig = MetaWebhookNormalizer.normalizePayload(instagramComment('same-id'))[0];
    const fb = MetaWebhookNormalizer.normalizePayload({
      object: 'page',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'psid-1' },
              timestamp: Date.now(),
              message: { mid: 'same-id', text: 'Hola' },
            },
          ],
        },
      ],
    })[0];
    expect(ig).toMatchObject({
      platform: 'instagram',
      externalEventId: 'meta:instagram:same-id',
      eventType: 'comment',
      recipient: { type: 'instagram_comment', commentId: 'same-id' },
    });
    expect(fb).toMatchObject({
      platform: 'facebook',
      externalEventId: 'meta:facebook:same-id',
      eventType: 'direct_message',
      recipient: { type: 'facebook_user', pageScopedId: 'psid-1' },
    });
  });

  test('ignores an irrelevant new comment but accepts every supported direct message', async () => {
    expect(
      await MetaIngestionService.acceptPayload(
        ownerA.toString(),
        instagramComment('irrelevant', 'Excelente publicación')
      )
    ).toHaveLength(0);
    const dm = {
      object: 'instagram',
      entry: [
        {
          messaging: [
            {
              sender: { id: 'ig-new' },
              timestamp: Date.now(),
              message: { mid: 'dm-1', text: 'Hola' },
            },
          ],
        },
      ],
    };
    expect(await MetaIngestionService.acceptPayload(ownerA.toString(), dm)).toHaveLength(1);
  });

  test('persists minimum Meta trace identifiers without the complete webhook', async () => {
    const payload = {
      object: 'page',
      entry: [
        {
          id: 'page-1',
          changes: [
            {
              field: 'comments',
              value: {
                id: 'comment-1',
                parent_id: 'parent-1',
                text: 'Oportunidad de negocio',
                from: { id: 'sender-1' },
                post_id: 'post-1',
                ignoredSecret: 'must-not-be-copied',
              },
            },
          ],
        },
      ],
    };
    const accepted = await MetaIngestionService.acceptPayload(ownerA.toString(), payload);
    const inbound: any = await InboundEvent.findById(accepted[0].id).lean();
    expect(inbound).toMatchObject({
      externalEventId: 'meta:facebook:comment-1',
      commentId: 'comment-1',
      parentId: 'parent-1',
      senderId: 'sender-1',
      recipientId: 'page-1',
      accountId: 'page-1',
      channel: 'facebook',
      eventType: 'comment',
    });
    expect(inbound.rawPayload).toMatchObject({
      commentId: 'comment-1',
      parentId: 'parent-1',
      senderId: 'sender-1',
      recipientId: 'page-1',
      contentId: 'post-1',
    });
    expect(inbound.rawPayload.ignoredSecret).toBeUndefined();
  });

  test('creates an assisted Instagram proposal without automatic outbound delivery', async () => {
    const accepted = await MetaIngestionService.acceptPayload(
      ownerA.toString(),
      instagramComment('ig-1')
    );
    await MetaIngestionService.processAccepted(ownerA.toString(), accepted[0]);
    const lead: any = await Lead.findOne({ userId: ownerA, platform: 'instagram' });
    const conversation: any = await Conversation.findOne({ userId: ownerA, leadId: lead._id });
    expect(lead).toMatchObject({
      username: 'ig-user',
      currentChannel: 'instagram',
      origin: {
        source: 'instagram_reel_or_post_comment',
        initialContent: 'Quiero más información',
      },
    });
    expect(conversation.messages[0]).toMatchObject({
      platform: 'instagram',
      direction: 'inbound',
      externalMessageId: 'meta:instagram:ig-1',
    });
    expect(await AssistedProposal.findOne({ sourceEventId: 'meta:instagram:ig-1' })).toMatchObject({
      platform: 'instagram',
      status: 'proposed',
      recipient: { type: 'instagram_comment', externalId: 'ig-1' },
    });
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });

  test('is idempotent, reuses an existing lead and isolates owners/channels', async () => {
    const first = await MetaIngestionService.acceptPayload(
      ownerA.toString(),
      instagramComment('shared')
    );
    await MetaIngestionService.processAccepted(ownerA.toString(), first[0]);
    expect(
      await MetaIngestionService.acceptPayload(ownerA.toString(), instagramComment('shared'))
    ).toHaveLength(0);
    const second = await MetaIngestionService.acceptPayload(
      ownerB.toString(),
      facebookComment('shared')
    );
    await MetaIngestionService.processAccepted(ownerB.toString(), second[0]);
    const continuation = await MetaIngestionService.acceptPayload(
      ownerA.toString(),
      instagramComment('ig-next', 'Gracias', 'ig-user')
    );
    await MetaIngestionService.processAccepted(ownerA.toString(), continuation[0]);
    expect(await Lead.countDocuments({ userId: ownerA, platform: 'instagram' })).toBe(1);
    expect(await Lead.countDocuments({ userId: ownerB, platform: 'facebook' })).toBe(1);
    expect(await Conversation.countDocuments({ userId: ownerA })).toBe(1);
    expect(await Conversation.countDocuments({ userId: ownerB })).toBe(1);
  });

  test('preserves the inbound message and marks processing failure when Gemini fails', async () => {
    jest
      .spyOn(aiIntegrations, 'getAIProvider')
      .mockReturnValue({
        name: 'mock',
        generateReply: jest.fn().mockRejectedValue(new Error('Gemini unavailable')),
      });
    const accepted = await MetaIngestionService.acceptPayload(
      ownerA.toString(),
      facebookComment('fb-failure')
    );
    await MetaIngestionService.processAccepted(ownerA.toString(), accepted[0]);
    expect(await InboundEvent.findById(accepted[0].id)).toMatchObject({
      processingState: 'failed',
    });
    const conversation: any = await Conversation.findOne({ userId: ownerA });
    expect(conversation.messages[0]).toMatchObject({
      platform: 'facebook',
      status: 'failed',
      processingError: 'No fue posible generar la propuesta asistida',
    });
    expect(await AssistedProposal.countDocuments({})).toBe(0);
  });

  test('rejects an invalid signed webhook before persistence', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation();
    const warn = jest.spyOn(console, 'warn').mockImplementation();
    process.env.META_APP_SECRET = 'secret';
    const body = Buffer.from(JSON.stringify(instagramComment('signed')));
    const req: any = {
      body,
      header: (name: string) =>
        name.toLowerCase() === 'x-hub-signature-256'
          ? `sha256=${crypto.createHmac('sha256', 'wrong').update(body).digest('hex')}`
          : undefined,
    };
    const res: any = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      sendStatus: jest.fn().mockReturnThis(),
    };
    await MetaController.receive(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(await InboundEvent.countDocuments({})).toBe(0);
    const observations = [...info.mock.calls, ...warn.mock.calls]
      .filter(([message]) => message === 'Meta webhook observability')
      .map(([, observation]) => observation as any);
    expect(observations.map(item => item.code)).toEqual(['received', 'signature_invalid']);
    expect(new Set(observations.map(item => item.correlationId)).size).toBe(1);
    expect(JSON.stringify(observations)).not.toContain('sha256=');
    expect(JSON.stringify(observations)).not.toContain('signed');
  });

  test('emits one sanitized fingerprint through persistence, CRM interaction and proposal', async () => {
    const info = jest.spyOn(console, 'info').mockImplementation();
    const sensitiveText = 'Quiero más información privada';
    const accepted = await MetaIngestionService.acceptPayload(
      ownerA.toString(),
      instagramComment('sensitive-comment-id', sensitiveText, 'sensitive-user-id'),
      'meta_req_test_safe'
    );
    await MetaIngestionService.processAccepted(ownerA.toString(), accepted[0]);

    const observations = info.mock.calls
      .filter(([message]) => message === 'Meta webhook observability')
      .map(([, observation]) => observation as any);
    expect(observations.map(item => item.code)).toEqual(
      expect.arrayContaining([
        'normalized',
        'new_event',
        'persist_ok',
        'interaction_created',
        'proposal_created',
        'completed',
      ])
    );
    expect(new Set(observations.map(item => item.correlationId))).toEqual(
      new Set(['meta_req_test_safe'])
    );
    expect(new Set(observations.map(item => item.eventFingerprint).filter(Boolean)).size).toBe(1);
    const serialized = JSON.stringify(observations);
    expect(serialized).not.toContain(sensitiveText);
    expect(serialized).not.toContain('sensitive-comment-id');
    expect(serialized).not.toContain('sensitive-user-id');
    expect(await OutboundMessage.countDocuments({})).toBe(0);
  });
});
