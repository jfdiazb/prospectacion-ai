jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));

import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import OpenAI from 'openai';
import AIInvocation from '../src/models/AIInvocation';
import { GroqService } from '../src/services/GroqService';

describe('Groq AIInvocation lease recovery', () => {
  let mongo: MongoMemoryServer;
  let userId: mongoose.Types.ObjectId;
  const originalEnv = { ...process.env };

  const telemetry = (sourceEventId: string) => ({
    userId: userId.toString(),
    sourceEventId,
    purpose: 'conversation',
    channel: 'whatsapp',
  });

  const mockCompletion = (text = 'Respuesta recuperada') => {
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: text } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create } },
    }));
    return create;
  };

  const baseInvocation = (sourceEventId: string) => ({
    userId,
    sourceEventId,
    purpose: 'conversation',
    channel: 'whatsapp',
    provider: 'groq',
    model: 'openai/gpt-oss-120b',
    promptHash: 'a'.repeat(64),
  });

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    userId = new mongoose.Types.ObjectId();
  });

  beforeEach(async () => {
    process.env = {
      ...originalEnv,
      NODE_ENV: 'test',
      AI_MODE: 'mock',
      GROQ_API_KEY: 'test-key',
      AI_INVOCATION_LEASE_MS: '30000',
    };
    await AIInvocation.deleteMany({});
    jest.clearAllMocks();
  });

  afterAll(async () => {
    process.env = { ...originalEnv };
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('does not reclaim a recent processing invocation', async () => {
    const create = mockCompletion();
    await AIInvocation.create({
      ...baseInvocation('recent'),
      status: 'processing',
      processingStartedAt: new Date(),
      leaseClaimId: 'active-worker',
    });

    await expect(GroqService.generateResponse('Prompt', telemetry('recent')))
      .rejects.toThrow('ya está en proceso');
    expect(create).not.toHaveBeenCalled();
  });

  test('reclaims an expired processing invocation', async () => {
    const create = mockCompletion();
    await AIInvocation.create({
      ...baseInvocation('expired'),
      status: 'processing',
      processingStartedAt: new Date(Date.now() - 60000),
      leaseClaimId: 'crashed-worker',
    });

    await expect(GroqService.generateResponse('Prompt', telemetry('expired')))
      .resolves.toBe('Respuesta recuperada');
    expect(create).toHaveBeenCalledTimes(1);
    await expect(AIInvocation.findOne({ sourceEventId: 'expired' }).lean())
      .resolves.toEqual(expect.objectContaining({ status: 'completed', responseText: 'Respuesta recuperada' }));
  });

  test('allows only one provider call when two workers reclaim concurrently', async () => {
    const create = mockCompletion();
    await AIInvocation.create({
      ...baseInvocation('concurrent'),
      status: 'processing',
      processingStartedAt: new Date(Date.now() - 60000),
      leaseClaimId: 'crashed-worker',
    });

    const results = await Promise.allSettled([
      GroqService.generateResponse('Prompt', telemetry('concurrent')),
      GroqService.generateResponse('Prompt', telemetry('concurrent')),
    ]);

    expect(create).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      { status: 'fulfilled', value: 'Respuesta recuperada' },
      { status: 'fulfilled', value: 'Respuesta recuperada' },
    ]);
  });

  test('reuses a completed response without calling the provider', async () => {
    const create = mockCompletion();
    await AIInvocation.create({
      ...baseInvocation('completed'),
      status: 'completed',
      responseText: 'Respuesta persistida',
      completedAt: new Date(),
    });

    await expect(GroqService.generateResponse('Prompt distinto', telemetry('completed')))
      .resolves.toBe('Respuesta persistida');
    expect(create).not.toHaveBeenCalled();
  });

  test('retries successfully after a simulated crash left an expired lease', async () => {
    const create = mockCompletion('Respuesta después del crash');
    await AIInvocation.create({
      ...baseInvocation('crash-retry'),
      status: 'processing',
      processingStartedAt: new Date(Date.now() - 60000),
      leaseClaimId: 'terminated-process',
    });

    await expect(GroqService.generateResponse('Mismo prompt', telemetry('crash-retry')))
      .resolves.toBe('Respuesta después del crash');
    expect(create).toHaveBeenCalledTimes(1);
  });

  test('safely reclaims an old legacy processing document without lease fields', async () => {
    const create = mockCompletion('Respuesta legacy');
    const legacy = await AIInvocation.create({ ...baseInvocation('legacy'), status: 'processing' });
    await AIInvocation.updateOne(
      { _id: legacy._id },
      {
        $unset: { processingStartedAt: 1, leaseClaimId: 1 },
        $set: { updatedAt: new Date(Date.now() - 60000) },
      },
      { timestamps: false }
    );

    await expect(GroqService.generateResponse('Prompt', telemetry('legacy')))
      .resolves.toBe('Respuesta legacy');
    expect(create).toHaveBeenCalledTimes(1);
  });
});
