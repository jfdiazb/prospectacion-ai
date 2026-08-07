import { getAIProvider } from '../src/integrations/ai';

describe('AI provider selection', () => {
  const originalEnv = process.env;
  afterEach(() => { process.env = { ...originalEnv }; });

  test('AI_MODE=mock overrides an available Gemini key', () => {
    process.env.AI_MODE = 'mock';
    process.env.GEMINI_API_KEY = 'not-used';
    expect(getAIProvider().name).toBe('mock');
  });

  test('AI_MODE=live selects Gemini explicitly', () => {
    process.env.AI_MODE = 'live';
    process.env.GEMINI_API_KEY = 'test-key';
    expect(getAIProvider().name).toBe('gemini');
  });

  test('legacy selection remains compatible when AI_MODE is absent', () => {
    delete process.env.AI_MODE;
    delete process.env.GEMINI_API_KEY;
    expect(getAIProvider().name).toBe('mock');
  });
});
