process.env.NODE_ENV = 'test';
process.env.PORT = '0';
import axios from 'axios';
import crypto from 'crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { startServer } from '../src/index';
import { disconnectDB } from '../src/config/database';
import type http from 'http';
import User from '../src/models/User';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import Activity from '../src/models/Activity';
import Task from '../src/models/Task';
import OutboundMessage from '../src/models/OutboundMessage';
import Meeting from '../src/models/Meeting';
import AutomationFlow from '../src/models/AutomationFlow';
import { YouTubeIngestionService } from '../src/services/YouTubeIngestionService';
import { MessagingService } from '../src/services/MessagingService';
import { MessagingProviderError, type MessagingProvider } from '../src/integrations/messaging';

jest.setTimeout(120000);

describe('Auth integration tests', () => {
  let server: http.Server;
  let mongoServer: MongoMemoryServer;
  let baseURL: string;

  beforeAll(async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.AI_MODE = 'mock';
    process.env.ZOOM_MODE = 'mock';
    process.env.META_MESSAGING_MODE = 'mock';
    delete process.env.CRM_OWNER_ID;
    mongoServer = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongoServer.getUri('alma-test');
    process.env.JWT_SECRET = 'alma-test-only-secret-with-at-least-32-characters';
    process.env.CORS_ORIGIN = 'http://localhost:3000';
    server = await startServer();
    // @ts-ignore
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 5001;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
    await mongoServer.stop();
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()));
    });
  });

  beforeEach(async () => {
    process.env.SCHEDULING_MODE = 'zoom';
    delete process.env.CALENDLY_BOOKING_URL;
    delete process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
    const collections = Object.keys(mongoose.connection.collections);
    for (const collectionName of collections) {
      const collection = mongoose.connection.collections[collectionName];
      await collection.deleteMany({});
    }
  });

  test('healthcheck should not be rate limited', async () => {
    const responses = await Promise.all(
      Array.from({ length: 105 }, () => axios.get(`${baseURL}/health`)),
    );

    expect(responses.every(response => response.status === 200)).toBe(true);
  });

  test('register then login should work', async () => {
    const email = 'testuser@example.com';
    const password = 'password123';

    const registerRes = await axios.post(`${baseURL}/api/v1/auth/register`, {
      email,
      password,
      fullName: 'Test User',
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.data.success).toBe(true);
    expect(registerRes.data.data).toHaveProperty('token');

    const loginRes = await axios.post(`${baseURL}/api/v1/auth/login`, {
      email,
      password,
    });

    expect(loginRes.status).toBe(200);
    expect(loginRes.data.success).toBe(true);
    expect(loginRes.data.data).toHaveProperty('token');
    expect(loginRes.data.data.user.email).toBe(email);

    const profileRes = await axios.get(`${baseURL}/api/v1/auth/profile`, {
      headers: {
        Authorization: `Bearer ${loginRes.data.data.token}`,
      },
    });

    expect(profileRes.status).toBe(200);
    expect(profileRes.data.success).toBe(true);
    expect(profileRes.data.data).toHaveProperty('email', email);
    expect(profileRes.data.data).toHaveProperty('fullName', 'Test User');
  });

  test('login with invalid password should fail', async () => {
    const email = 'baduser@example.com';
    const password = 'goodpassword';

    const registerRes = await axios.post(`${baseURL}/api/v1/auth/register`, {
      email,
      password,
      fullName: 'Bad User',
    });
    expect(registerRes.status).toBe(201);
    expect(registerRes.data.success).toBe(true);

    await expect(
      axios.post(`${baseURL}/api/v1/auth/login`, {
        email,
        password: 'wrongpassword',
      }),
    ).rejects.toMatchObject({
      response: {
        status: 400,
        data: expect.objectContaining({ success: false }),
      },
    });
  });

  test('profile update and password change should work', async () => {
    const email = 'profileuser@example.com';
    const password = 'initialPass123';

    const registerRes = await axios.post(`${baseURL}/api/v1/auth/register`, {
      email,
      password,
      fullName: 'Profile User',
    });

    expect(registerRes.status).toBe(201);
    expect(registerRes.data.success).toBe(true);

    const loginRes = await axios.post(`${baseURL}/api/v1/auth/login`, {
      email,
      password,
    });

    const token = loginRes.data.data.token;
    expect(token).toBeTruthy();

    const updateRes = await axios.put(
      `${baseURL}/api/v1/auth/profile`,
      {
        fullName: 'Profile Updated',
        avatar: 'https://example.com/avatar.png',
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(updateRes.status).toBe(200);
    expect(updateRes.data.success).toBe(true);
    expect(updateRes.data.data).toHaveProperty('fullName', 'Profile Updated');
    expect(updateRes.data.data).toHaveProperty('avatar', 'https://example.com/avatar.png');

    const passwordRes = await axios.post(
      `${baseURL}/api/v1/auth/change-password`,
      {
        oldPassword: password,
        newPassword: 'newPass456',
      },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    expect(passwordRes.status).toBe(200);
    expect(passwordRes.data.success).toBe(true);

    const reloginRes = await axios.post(`${baseURL}/api/v1/auth/login`, {
      email,
      password: 'newPass456',
    });

    expect(reloginRes.status).toBe(200);
    expect(reloginRes.data.success).toBe(true);
  });

  test('mock Meta INFO event should create and qualify a lead', async () => {
    await axios.post(`${baseURL}/api/v1/auth/register`, {
      email: 'owner@example.com', password: 'password123', fullName: 'CRM Owner',
    });
    const owner = await User.findOne({ email: 'owner@example.com' });
    process.env.CRM_OWNER_ID = owner!._id.toString();
    process.env.META_MOCK_MODE = 'true';
    process.env.META_VERIFY_TOKEN = 'local-meta-verify-token';

    const verification = await axios.get(`${baseURL}/api/v1/meta/webhook`, {
      params: { 'hub.mode': 'subscribe', 'hub.verify_token': 'local-meta-verify-token', 'hub.challenge': 'alma-ok' },
    });
    expect(verification.data).toBe('alma-ok');

    const eventId = 'mock-comment-info-1';
    const payload = {
      entry: [{ changes: [{ field: 'comments', value: { id: eventId, text: 'INFO', from: { id: 'instagram-user-1' }, platform: 'instagram', media: { id: 'reel-1' } } }] }],
    };
    const response = await axios.post(`${baseURL}/api/v1/meta/webhook`, payload, {
      headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' },
    });

    expect(response.status).toBe(200);
    const lead = await Lead.findOne({ userId: owner!._id, username: 'instagram-user-1' });
    expect(lead).toMatchObject({ platform: 'instagram', status: 'interested', score: 65, interestLevel: 'warm' });
    expect(await Conversation.countDocuments({ leadId: lead!._id })).toBe(1);
    expect(await InboundEvent.countDocuments({ externalEventId: eventId })).toBe(1);
    expect(await Activity.countDocuments({ leadId: lead!._id })).toBeGreaterThanOrEqual(3);
    expect(await Task.countDocuments({ leadId: lead!._id, status: 'pending' })).toBeGreaterThanOrEqual(1);
    const initialOutbound = await OutboundMessage.findOne({ sourceEventId: eventId });
    expect(initialOutbound).toMatchObject({ deliveryStatus: 'simulated', provider: 'mock', recipientId: eventId, commentId: eventId, messageType: 'private_reply', simulatedDelivery: true });
    expect(initialOutbound?.externalMessageId).toBeTruthy();
    expect(initialOutbound?.sentAt).toBeTruthy();

    const loginRes = await axios.post(`${baseURL}/api/v1/auth/login`, {
      email: 'owner@example.com',
      password: 'password123',
    });
    const tasksRes = await axios.get(`${baseURL}/api/v1/crm/tasks`, {
      headers: { Authorization: `Bearer ${loginRes.data.data.token}` },
    });
    expect(tasksRes.status).toBe(200);
    expect(tasksRes.data.success).toBe(true);
    expect(Array.isArray(tasksRes.data.data)).toBe(true);
    expect(tasksRes.data.data.length).toBeGreaterThanOrEqual(1);

    await axios.post(`${baseURL}/api/v1/meta/webhook`, payload, {
      headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' },
    });
    expect(await InboundEvent.countDocuments({ externalEventId: eventId })).toBe(1);
    expect(await OutboundMessage.countDocuments({ sourceEventId: eventId })).toBe(1);

    const directEventId = 'mock-direct-message-1';
    await axios.post(`${baseURL}/api/v1/meta/webhook`, {
      entry: [{ changes: [{ field: 'messages', value: { sender: { id: 'instagram-user-1' }, message: { mid: directEventId, text: 'Quiero agendar una reunión' }, platform: 'instagram' } }] }],
    }, { headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' } });
    const directOutbound = await OutboundMessage.findOne({ sourceEventId: directEventId });
    expect(directOutbound).toMatchObject({ deliveryStatus: 'simulated', provider: 'mock', recipientId: 'instagram-user-1', messageType: 'direct_message', simulatedDelivery: true });
    expect(directOutbound?.commentId).toBeUndefined();
    expect(await Meeting.findOne({ leadId: lead!._id })).toMatchObject({ status: 'pending_details', provider: 'zoom' });

    const detailsEventId = 'mock-direct-meeting-details-1';
    await axios.post(`${baseURL}/api/v1/meta/webhook`, {
      entry: [{ changes: [{ field: 'messages', value: { sender: { id: 'instagram-user-1' }, message: { mid: detailsEventId, text: 'Mi correo es prospecto@example.com, el 20/08/2027 a las 3:30 pm en Bogotá' }, platform: 'instagram' } }] }],
    }, { headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' } });
    expect(await Meeting.findOne({ leadId: lead!._id })).toMatchObject({ status: 'pending_configuration', attendeeEmail: 'prospecto@example.com', requestedDate: '2027-08-20', requestedTime: '15:30', timezone: 'America/Bogota' });
    expect(await Meeting.countDocuments({ leadId: lead!._id })).toBe(1);
    expect(await OutboundMessage.findOne({ sourceEventId: detailsEventId })).toMatchObject({ messageType: 'direct_message', deliveryStatus: 'simulated' });
    expect(await Task.countDocuments({ leadId: lead!._id, type: 'follow_up', status: 'pending' })).toBe(1);

    const cancellationEventId = 'mock-direct-meeting-cancellation-1';
    await axios.post(`${baseURL}/api/v1/meta/webhook`, {
      entry: [{ changes: [{ field: 'messages', value: { sender: { id: 'instagram-user-1' }, message: { mid: cancellationEventId, text: 'Cancela la reunion anterior' }, platform: 'instagram' } }] }],
    }, { headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' } });
    expect(await Meeting.findOne({ leadId: lead!._id })).toMatchObject({ status: 'cancelled' });
  });

  test('executes an active YouTube keyword automation once and continues the ALMA workflow', async () => {
    await axios.post(`${baseURL}/api/v1/auth/register`, { email: 'automation@example.com', password: 'password123', fullName: 'Automation Owner' });
    const owner = await User.findOne({ email: 'automation@example.com' });
    const flow = await AutomationFlow.create({
      userId: owner!._id,
      name: 'Guía gratuita',
      trigger: { type: 'keyword', keyword: 'GUÍA', keywords: ['GUÍA'] },
      actions: [{ type: 'send_message', message: 'Aquí tienes la información solicitada.' }],
      isActive: true,
    });

    const service = new YouTubeIngestionService();
    const comment = { id: 'youtube-automation-1', snippet: { textOriginal: 'Quiero la guia, por favor', authorDisplayName: 'Prospecto', authorChannelId: { value: 'channel-prospect-1' }, videoId: 'video-1' } };
    expect(await service.processComment(owner!._id.toString(), comment, comment.id, 'owner-channel')).toBe('processed');
    expect(await service.processComment(owner!._id.toString(), comment, comment.id, 'owner-channel')).toBe('duplicate');

    const lead = await Lead.findOne({ userId: owner!._id, username: 'channel-prospect-1' });
    const outbound = await OutboundMessage.findOne({ sourceEventId: 'youtube:youtube-automation-1' });
    const updatedFlow = await AutomationFlow.findById(flow._id);
    expect(lead).toMatchObject({ platform: 'youtube', source: 'youtube_automation' });
    expect(outbound).toMatchObject({ text: 'Aquí tienes la información solicitada.', messageType: 'youtube_reply', deliveryStatus: 'simulated' });
    expect(updatedFlow?.executionStats?.totalExecutions).toBe(1);
    expect(updatedFlow?.executionStats?.successfulExecutions).toBe(1);
    expect(updatedFlow?.executionStats?.failedExecutions).toBe(0);
    expect(await Activity.findOne({ leadId: lead!._id, 'metadata.automationFlowId': flow._id.toString() })).toBeTruthy();
    expect(await Task.countDocuments({ leadId: lead!._id, status: 'pending' })).toBe(1);
  });

  test('an already claimed comment does not create a lead or outbound message', async () => {
    await axios.post(`${baseURL}/api/v1/auth/register`, { email: 'claimed@example.com', password: 'password123', fullName: 'Claimed Owner' });
    const owner = await User.findOne({ email: 'claimed@example.com' });
    process.env.CRM_OWNER_ID = owner!._id.toString();
    process.env.META_MOCK_MODE = 'true';
    await InboundEvent.create({ userId: owner!._id, externalEventId: 'already-claimed-comment', channel: 'instagram', eventType: 'comments', senderId: 'ignored-user', text: 'INFO' });
    await axios.post(`${baseURL}/api/v1/meta/webhook`, {
      entry: [{ changes: [{ field: 'comments', value: { id: 'already-claimed-comment', text: 'INFO', from: { id: 'ignored-user' }, platform: 'instagram' } }] }],
    }, { headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' } });
    expect(await Lead.countDocuments({ username: 'ignored-user' })).toBe(0);
    expect(await OutboundMessage.countDocuments({ sourceEventId: 'already-claimed-comment' })).toBe(0);
  });

  test('persists failed delivery details', async () => {
    await axios.post(`${baseURL}/api/v1/auth/register`, { email: 'failure@example.com', password: 'password123', fullName: 'Failure Owner' });
    const owner = await User.findOne({ email: 'failure@example.com' });
    process.env.CRM_OWNER_ID = owner!._id.toString();
    process.env.META_MOCK_MODE = 'true';
    await axios.post(`${baseURL}/api/v1/meta/webhook`, {
      entry: [{ changes: [{ field: 'comments', value: { id: 'failure-seed', text: 'INFO', from: { id: 'failure-user' }, platform: 'instagram' } }] }],
    }, { headers: { 'x-alma-mock-event': 'true', 'Content-Type': 'application/json' } });
    const lead = await Lead.findOne({ username: 'failure-user' });
    const conversation = await Conversation.findOne({ leadId: lead!._id });
    const failingProvider: MessagingProvider = { name: 'meta', sendMessage: async () => { throw new MessagingProviderError('Invalid OAuth access token.', '190', 401); } };
    await MessagingService.send({ userId: owner!._id.toString(), leadId: lead!._id.toString(), conversationId: conversation!._id.toString(), sourceEventId: 'failed-delivery-event', text: 'Hola', recipient: { type: 'instagram_user', instagramScopedId: 'failure-user' } }, failingProvider);
    const outbound = await OutboundMessage.findOne({ sourceEventId: 'failed-delivery-event' });
    expect(outbound).toMatchObject({ deliveryStatus: 'failed', provider: 'meta', recipientId: 'failure-user', errorCode: '190', errorMessage: 'Invalid OAuth access token.', simulatedDelivery: false });
    expect(outbound?.failedAt).toBeTruthy();
  });

  test('keeps the signed WhatsApp webhook compatible and idempotent', async () => {
    await axios.post(`${baseURL}/api/v1/auth/register`, { email: 'whatsapp@example.com', password: 'password123', fullName: 'WhatsApp Owner' });
    const owner = await User.findOne({ email: 'whatsapp@example.com' });
    process.env.CRM_OWNER_ID = owner!._id.toString();
    process.env.WHATSAPP_APP_SECRET = 'whatsapp-test-secret';
    process.env.WHATSAPP_AUTO_REPLY_ENABLED = 'false';
    const eventId = 'wamid.webhook-compatible-1';
    const rawPayload = JSON.stringify({ entry: [{ changes: [{ value: { messages: [{ id: eventId, from: '573001234567', type: 'text', text: { body: 'Hola ALMA' } }] } }] }] });
    const signature = `sha256=${crypto.createHmac('sha256', process.env.WHATSAPP_APP_SECRET).update(Buffer.from(rawPayload)).digest('hex')}`;
    const config = { headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': signature } };
    expect((await axios.post(`${baseURL}/api/v1/whatsapp/webhook`, rawPayload, config)).status).toBe(200);
    expect((await axios.post(`${baseURL}/api/v1/whatsapp/webhook`, rawPayload, config)).status).toBe(200);
    const lead = await Lead.findOne({ userId: owner!._id, phone: '573001234567' });
    expect(lead).toMatchObject({ platform: 'whatsapp', source: 'whatsapp_webhook' });
    expect(await Conversation.countDocuments({ leadId: lead!._id })).toBe(1);
    expect(await InboundEvent.countDocuments({ externalEventId: eventId })).toBe(1);
    expect(await OutboundMessage.countDocuments({ sourceEventId: eventId })).toBe(0);
  });
});
