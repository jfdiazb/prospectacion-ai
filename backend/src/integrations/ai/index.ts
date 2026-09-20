import type { AIProvider } from './AIProvider';
import { GeminiAIProvider } from './GeminiAIProvider';
import { MockAIProvider } from './MockAIProvider';
import { GroqAIProvider } from '../../providers/ai/GroqAIProvider';

export type AIRuntimeStatus = {
  mode: 'mock' | 'live' | 'auto';
  provider: 'mock' | 'groq' | 'gemini';
  fallbackProvider: 'mock' | null;
};

export const getAIRuntimeStatus = (): AIRuntimeStatus => {
  const mode = process.env.AI_MODE;
  const configuredProvider = process.env.AI_PROVIDER?.trim().toLowerCase();
  const liveProvider = configuredProvider === 'gemini'
    ? 'gemini'
    : configuredProvider === 'groq' || process.env.GROQ_API_KEY
      ? 'groq'
      : 'gemini';
  const provider = mode === 'live'
    ? liveProvider
    : !mode && process.env.GROQ_API_KEY
      ? 'groq'
      : !mode && process.env.GEMINI_API_KEY
        ? 'gemini'
        : 'mock';

  return {
    mode: mode === 'mock' || mode === 'live' ? mode : 'auto',
    provider,
    fallbackProvider: null,
  };
};

export const getAIProvider = (): AIProvider => {
  const provider = getAIRuntimeStatus().provider;
  if (provider === 'groq') return new GroqAIProvider();
  if (provider === 'gemini') return new GeminiAIProvider();
  return new MockAIProvider();
};
