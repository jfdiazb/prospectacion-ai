import type { AIProvider } from './AIProvider';
import { GeminiAIProvider } from './GeminiAIProvider';
import { MockAIProvider } from './MockAIProvider';

export const getAIProvider = (): AIProvider => {
  const mode = process.env.AI_MODE;
  if (mode === 'mock') return new MockAIProvider();
  if (mode === 'live') return new GeminiAIProvider();
  return process.env.GEMINI_API_KEY ? new GeminiAIProvider() : new MockAIProvider();
};
