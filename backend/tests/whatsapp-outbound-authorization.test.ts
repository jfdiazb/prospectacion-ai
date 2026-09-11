process.env.NODE_ENV = 'test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import { MessagingService } from '../src/services/MessagingService';
import type { MessagingProvider } from '../src/integrations/messaging';

jest.setTimeout(120000);

describe('WhatsApp conversation-scoped outbound authorization', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = process.env;
  const userId = new mongoose.Types.ObjectId();
  const provider: MessagingProvider = {
    name: 'meta',
    sendMessage: jest.fn(async () => ({ externalMessageId: 'wamid.test-outbound', simulated: false })),
  };

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri('whatsapp-authorization'));
    await Promise.all([InboundEvent.syncIndexes(), OutboundMessage.syncIndexes()]);
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
      WHATSAPP_PHONE_NUMBER_ID: 'business-phone-id',
      WHATSAPP_ACTIVATION_ALLOWLIST: '573001111111',
      WHATSAPP_AUTO_REPLY_ENABLED: 'false',
    };
    jest.clearAllMocks();
    await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({})));
  });

  const leadAndConversation = async (phone: string, source = 'manual') => {
    const lead: any = await Lead.create({ userId, username: phone, phone, platform: 'whatsapp', source, status: 'new' });
    const conversation: any = await Conversation.create({ userId, leadId: lead._id, messages: [] });
    return { lead, conversation };
  };

  const addInboundEvidence = async (lead: any, conversation: any, eventId: string, eventTimestamp = new Date()) => {
    await InboundEvent.create({
      userId,
      externalEventId: eventId,
      channel: 'whatsapp',
      eventType: 'text',
      senderId: lead.phone,
      accountId: 'business-phone-id',
      messageId: eventId,
      eventTimestamp,
      processingState: 'completed',
      conversationRecordedAt: eventTimestamp,
      processedAt: eventTimestamp,
    });
    conversation.messages.push({ sender: 'lead', text: 'Hola', platform: 'whatsapp', direction: 'inbound', status: 'received', externalMessageId: eventId });
    await conversation.save();
  };

  test('legitimate persisted inbound authorizes only its conversation and records evidence', async () => {
    const { lead, conversation } = await leadAndConversation('573002222222', 'whatsapp_webhook');
    await addInboundEvidence(lead, conversation, 'wamid.inbound-1');
    const context = { userId: userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: 'proposal:one', text: 'Respuesta asistida', recipient: { type: 'whatsapp_user' as const, phoneNumber: lead.phone } };
    await expect(MessagingService.send(context, provider)).resolves.toBe('sent');
    await expect(MessagingService.send(context, provider)).resolves.toBe('duplicate');
    expect(provider.sendMessage).toHaveBeenCalledTimes(1);
    expect(await OutboundMessage.findOne({ sourceEventId: 'proposal:one' })).toMatchObject({
      deliveryStatus: 'sent',
      externalMessageId: 'wamid.test-outbound',
      authorization: { mode: 'inbound_conversation', sourceEventId: 'wamid.inbound-1', channel: 'whatsapp' },
    });
  });

  test('CRM-only and unknown contacts are blocked before the provider', async () => {
    const { lead, conversation } = await leadAndConversation('573003333333');
    await expect(MessagingService.send({ userId: userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: 'manual-only', text: 'No enviar', recipient: { type: 'whatsapp_user', phoneNumber: lead.phone } }, provider)).resolves.toBe('failed');
    await expect(MessagingService.send({ userId: userId.toString(), leadId: new mongoose.Types.ObjectId().toString(), conversationId: new mongoose.Types.ObjectId().toString(), sourceEventId: 'unknown', text: 'No enviar', recipient: { type: 'whatsapp_user', phoneNumber: '573009999999' } }, provider)).resolves.toBe('failed');
    expect(provider.sendMessage).not.toHaveBeenCalled();
    expect(await OutboundMessage.countDocuments({ deliveryStatus: 'failed', errorCode: 'WHATSAPP_RECIPIENT_NOT_AUTHORIZED' })).toBe(2);
  });

  test('duplicate inbound evidence is unique and does not create duplicate authorization or delivery', async () => {
    const { lead, conversation } = await leadAndConversation('573004444444', 'whatsapp_webhook');
    await addInboundEvidence(lead, conversation, 'wamid.replay-1');
    await expect(InboundEvent.create({ userId, externalEventId: 'wamid.replay-1', channel: 'whatsapp', eventType: 'text', senderId: lead.phone })).rejects.toMatchObject({ code: 11000 });
    expect(await InboundEvent.countDocuments({ externalEventId: 'wamid.replay-1' })).toBe(1);
  });

  test('inbound evidence outside the 24-hour customer service window is blocked', async () => {
    const { lead, conversation } = await leadAndConversation('573005555555', 'whatsapp_webhook');
    await addInboundEvidence(lead, conversation, 'wamid.expired-1', new Date(Date.now() - 24 * 60 * 60 * 1000 - 1000));
    await expect(MessagingService.send({ userId: userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: 'expired-window', text: 'No enviar', recipient: { type: 'whatsapp_user', phoneNumber: lead.phone } }, provider)).resolves.toBe('failed');
    expect(provider.sendMessage).not.toHaveBeenCalled();
  });

  test('static control allowlist remains eligible without inbound and auto reply remains off', async () => {
    const { lead, conversation } = await leadAndConversation('573001111111');
    await expect(MessagingService.send({ userId: userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: 'control-send', text: 'Control', recipient: { type: 'whatsapp_user', phoneNumber: lead.phone } }, provider)).resolves.toBe('sent');
    expect(await OutboundMessage.findOne({ sourceEventId: 'control-send' })).toMatchObject({ authorization: { mode: 'static_allowlist' } });
    expect(process.env.WHATSAPP_AUTO_REPLY_ENABLED).toBe('false');
  });
});
