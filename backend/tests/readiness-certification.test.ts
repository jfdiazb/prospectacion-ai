process.env.NODE_ENV = 'test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import InboundEvent from '../src/models/InboundEvent';
import OutboundMessage from '../src/models/OutboundMessage';
import { ReadinessService } from '../src/services/ReadinessService';
import { MessagingConfirmationService } from '../src/services/MessagingConfirmationService';

jest.setTimeout(120000);

describe('external delivery certification', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = process.env;
  const userId = new mongoose.Types.ObjectId();
  const leadId = new mongoose.Types.ObjectId();
  const conversationId = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('readiness-certification'));
  });

  afterAll(async () => {
    process.env = originalEnv;
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await mongo.stop();
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      MONGO_URI: mongo.getUri('readiness-certification'),
      JWT_SECRET: 'test-secret-with-at-least-32-characters',
      FACEBOOK_MESSAGING_MODE: 'live',
      META_PAGE_ACCESS_TOKEN: 'page-token',
      META_PAGE_ID: 'page-id',
      REQUIRED_LIVE_CHANNELS: 'facebook',
      BEHAVIORAL_CERTIFICATION_VERSION: 'behavioral-commercial-v1',
      BEHAVIORAL_CERTIFICATION_STATUS: 'passed',
      RELEASE_COMMIT: 'same-commit',
      RENDER_GIT_COMMIT: 'same-commit',
    };
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  const outbound = (deliveryStatus: string) => OutboundMessage.create({
    userId, leadId, conversationId, sourceEventId: `facebook:${deliveryStatus}`,
    channel: 'facebook', messageType: 'private_reply', transportKind: 'private_reply',
    text: 'Respuesta', deliveryStatus, provider: 'meta', recipientId: 'comment-id',
    simulatedDelivery: false,
  });

  test('provider acceptance never certifies external publication', async () => {
    await outbound('sent');
    const readiness = await ReadinessService.inspect();
    expect(readiness.runtime.providers.facebook.certification).toMatchObject({
      responseGenerated: true,
      providerAccepted: true,
      externallyConfirmed: false,
      operational: false,
    });
    expect(readiness.runtime.providers.facebook.outbound).toBe('pending');
    expect(readiness.externalDeliveryCertified).toBe(false);
    expect(readiness.goLive).toBe(false);
  });

  test('requires real inbound plus externally confirmed delivery for operational certification', async () => {
    await outbound('confirmed');
    await InboundEvent.create({
      userId, externalEventId: 'facebook:inbound', channel: 'facebook', eventType: 'comment',
      senderId: 'sender', processingState: 'completed',
    });
    const readiness = await ReadinessService.inspect();
    expect(readiness.runtime.providers.facebook.certification).toMatchObject({
      realReception: true,
      providerAccepted: true,
      externallyConfirmed: true,
      operational: true,
    });
    expect(readiness.externalDeliveryCertified).toBe(true);
    expect(readiness.goLive).toBe(true);
  });

  test('confirmation requires matching owner, external id and non-simulated provider evidence', async () => {
    const message: any = await outbound('sent');
    message.externalMessageId = 'external-message-id';
    await message.save();
    await expect(MessagingConfirmationService.confirm({
      userId: new mongoose.Types.ObjectId().toString(),
      messageId: message._id.toString(),
      externalMessageId: 'external-message-id',
      evidenceSource: 'provider_readback',
    })).resolves.toBeNull();
    const confirmed: any = await MessagingConfirmationService.confirm({
      userId: userId.toString(),
      messageId: message._id.toString(),
      externalMessageId: 'external-message-id',
      evidenceSource: 'provider_readback',
    });
    expect(confirmed).toMatchObject({
      deliveryStatus: 'confirmed',
      confirmationEvidenceSource: 'provider_readback',
    });
    expect(confirmed.confirmedAt).toBeTruthy();
  });
});
