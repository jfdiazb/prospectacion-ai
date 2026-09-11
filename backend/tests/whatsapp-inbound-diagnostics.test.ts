import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../src/app';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import User from '../src/models/User';
import { generateToken } from '../src/utils/helpers';

describe('WhatsApp inbound administrative diagnostics', () => {
  let mongo: MongoMemoryServer;
  let mongoPath: string;
  let server: any;
  let baseURL: string;

  beforeAll(async () => {
    process.env.JWT_SECRET = 'diagnostics-test-secret-with-sufficient-length';
    process.env.WHATSAPP_MESSAGING_MODE = 'mock';
    process.env.WHATSAPP_AUTO_REPLY_ENABLED = 'false';
    mongoPath = path.join(process.cwd(), `.mongo-whatsapp-diagnostics-${process.pid}-${Date.now()}`);
    fs.mkdirSync(mongoPath);
    mongo = await MongoMemoryServer.create({ instance: { dbPath: mongoPath } });
    await mongoose.connect(mongo.getUri());
    server = app.listen(0);
    await new Promise(resolve => server.once('listening', resolve));
    baseURL = `http://127.0.0.1:${server.address().port}`;
  });

  afterAll(async () => {
    await new Promise(resolve => server.close(resolve));
    await mongoose.disconnect();
    await mongo.stop();
    if (mongoPath.startsWith(`${process.cwd()}${path.sep}.mongo-whatsapp-diagnostics-`)) fs.rmSync(mongoPath, { recursive: true, force: true });
  });

  test('is admin-only, returns sanitized exact counts and performs no writes', async () => {
    const admin: any = await User.create({ email: 'admin-diagnostics@example.com', password: 'password123', fullName: 'Admin', role: 'admin' });
    const user: any = await User.create({ email: 'user-diagnostics@example.com', password: 'password123', fullName: 'User', role: 'user' });
    const lead: any = await Lead.create({ userId: admin._id, username: '573001234567', phone: '573001234567', platform: 'whatsapp' });
    const text = 'Hola, quiero mas informacion.';
    const eventId = 'wamid.real-controlled-test';
    const occurredAt = new Date('2026-08-29T22:53:00.000Z');
    await InboundEvent.create({ userId: admin._id, externalEventId: eventId, channel: 'whatsapp', eventType: 'text', senderId: lead.phone, messageId: eventId, text, eventTimestamp: occurredAt, processingState: 'completed', processingAttempts: 1, conversationRecordedAt: occurredAt, processedAt: occurredAt });
    await Conversation.create({ userId: admin._id, leadId: lead._id, messages: [{ sender: 'lead', text, platform: 'whatsapp', direction: 'inbound', status: 'received', externalMessageId: eventId }] });
    const params = { from: '2026-08-29T22:52:00.000Z', to: '2026-08-29T22:54:00.000Z', textSha256: crypto.createHash('sha256').update(text).digest('hex') };
    const before = { inbound: await InboundEvent.countDocuments(), conversations: await Conversation.countDocuments(), leads: await Lead.countDocuments(), outbound: await OutboundMessage.countDocuments() };
    const unauthorized = await axios.get(`${baseURL}/api/v1/whatsapp/admin/inbound-diagnostics`, { params, validateStatus: () => true });
    expect(unauthorized.status).toBe(401);
    const forbidden = await axios.get(`${baseURL}/api/v1/whatsapp/admin/inbound-diagnostics`, { params, headers: { Authorization: `Bearer ${generateToken({ id: user._id.toString(), role: 'admin' })}` }, validateStatus: () => true });
    expect(forbidden.status).toBe(403);
    const response = await axios.get(`${baseURL}/api/v1/whatsapp/admin/inbound-diagnostics`, { params, headers: { Authorization: `Bearer ${generateToken({ id: admin._id.toString(), role: 'user' })}` } });
    expect(response.data.data).toMatchObject({ inboundEventCount: 1, uniqueExternalEventCount: 1, messagePersistenceCount: 1, leadMatchCount: 1, conversationMatchCount: 1, outboundMode: 'mock', autoReplyEnabled: false });
    expect(JSON.stringify(response.data)).not.toContain(text);
    expect(JSON.stringify(response.data)).not.toContain(lead.phone);
    expect(JSON.stringify(response.data)).not.toContain(eventId);
    expect({ inbound: await InboundEvent.countDocuments(), conversations: await Conversation.countDocuments(), leads: await Lead.countDocuments(), outbound: await OutboundMessage.countDocuments() }).toEqual(before);
  });
});
