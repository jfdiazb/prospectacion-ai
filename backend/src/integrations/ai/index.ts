import type { AIProvider } from './AIProvider';
import { GeminiAIProvider } from './GeminiAIProvider';
import { MockAIProvider } from './MockAIProvider';

export const getAIProvider = (): AIProvider => process.env.GEMINI_API_KEY ? new GeminiAIProvider() : new MockAIProvider();
