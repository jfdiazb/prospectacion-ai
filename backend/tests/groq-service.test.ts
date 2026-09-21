jest.mock('openai', () => ({ __esModule: true, default: jest.fn() }));

import OpenAI from 'openai';
import { GroqService } from '../src/services/GroqService';

describe('GroqService generation budget', () => {
  const originalEnv = process.env;

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  test('requests low reasoning with enough completion budget and returns final text', async () => {
    process.env.GROQ_API_KEY = 'test-key';
    delete process.env.GROQ_MAX_TOKENS;
    const create = jest.fn().mockResolvedValue({
      choices: [{ message: { content: 'Respuesta comercial breve y completa.' } }],
      usage: { prompt_tokens: 120, completion_tokens: 80, total_tokens: 200 },
    });
    (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
      chat: { completions: { create } },
    }));

    await expect(GroqService.generateResponse('Prompt seguro')).resolves.toBe('Respuesta comercial breve y completa.');
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'openai/gpt-oss-120b',
      max_completion_tokens: 384,
      reasoning_effort: 'low',
    }));
  });
});
