process.env.NODE_ENV = 'test';
process.env.PORT = '0';
import axios from 'axios';
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

jest.setTimeout(120000);

describe('Auth integration tests', () => {
  let server: http.Server;
  let mongoServer: MongoMemoryServer;
  let baseURL: string;

  beforeAll(async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.ZOOM_MODE = 'mock';
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
    const collections = Object.keys(mongoose.connection.collections);
    for (const collectionName of collections) {
      const collection = mongoose.connection.collections[collectionName];
      await collection.deleteMany({});
    }
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
  });
});
