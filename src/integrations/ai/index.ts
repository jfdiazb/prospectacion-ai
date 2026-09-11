import type { AIProvider } from './AIProvider';
import { GeminiAIProvider } from './GeminiAIProvider';
import { MockAIProvider } from './MockAIProvider';

export type AIRuntimeStatus = {
  mode: 'mock' | 'live' | 'auto';
  provider: 'mock' | 'gemini';
  fallbackProvider: 'mock' | null;
};

export const getAIRuntimeStatus = (): AIRuntimeStatus => {
  const mode = process.env.AI_MODE;
  const provider = mode === 'live' || (!mode && process.env.GEMINI_API_KEY) ? 'gemini' : 'mock';

  return {
    mode: mode === 'mock' || mode === 'live' ? mode : 'auto',
    provider,
    fallbackProvider: provider === 'gemini' ? 'mock' : null,
  };
};

export const getAIProvider = (): AIProvider => {
  return getAIRuntimeStatus().provider === 'gemini'
    ? new GeminiAIProvider()
    : new MockAIProvider();
};
