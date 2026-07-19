process.env.NODE_ENV = 'test';
process.env.PORT = '0';
import axios from 'axios';
import mongoose from 'mongoose';
import { startServer } from '../src/index';
import { disconnectDB } from '../src/config/database';
import type http from 'http';

jest.setTimeout(120000);

describe('Auth integration tests', () => {
  let server: http.Server;
  let baseURL: string;

  beforeAll(async () => {
    server = await startServer();
    // @ts-ignore
    const addr = server.address();
    const port = typeof addr === 'object' && addr ? addr.port : 5001;
    baseURL = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await disconnectDB();
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
});
