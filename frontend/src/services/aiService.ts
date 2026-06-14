import { apiClient } from './api';
import type { IApiResponse } from '@types';

/**
 * Servicio de IA
 */
export const aiService = {
  async generateMessage(leadProfile: {
    username: string;
    bio?: string;
    platform: string;
    interestLevel: string;
  }): Promise<string> {
    const { data } = await apiClient.post<IApiResponse<string>>('/ai/generate-message', leadProfile);
    return data.data!;
  },

  async analyzeSentiment(message: string) {
    const { data } = await apiClient.post<IApiResponse<any>>('/ai/analyze-sentiment', { message });
    return data.data;
  },

  async detectIntent(message: string) {
    const { data } = await apiClient.post<IApiResponse<any>>('/ai/detect-intent', { message });
    return data.data;
  },

  async generateObjectionResponse(objection: string, context?: string): Promise<string> {
    const { data } = await apiClient.post<IApiResponse<string>>('/ai/objection-response', {
      objection,
      context,
    });
    return data.data!;
  },

  async analyzeProfile(profileData: any) {
    const { data } = await apiClient.post<IApiResponse<any>>('/ai/analyze-profile', profileData);
    return data.data;
  },

  async generateViralIdeas(niche: string, count = 5): Promise<string[]> {
    const { data } = await apiClient.post<IApiResponse<string[]>>('/ai/viral-ideas', {
      niche,
      count,
    });
    return data.data!;
  },
};
