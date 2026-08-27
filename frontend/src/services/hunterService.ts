import { apiClient } from './api';
import type { IApiResponse, IHunterProfile } from '@types';

export const hunterService = {
  async searchProfiles(params: {
    keyword?: string;
    profileId?: string;
    type?: 'channel' | 'video';
    minFollowers?: number;
    maxFollowers?: number;
    regionCode?: string;
    publishedAfter?: string;
    pageToken?: string;
    minScore?: number;
    quantity?: number;
    recentDays?: number;
  }): Promise<IApiResponse<{ results: IHunterProfile[]; cached: boolean; profileId: string; searchedQueries: number; mode: 'mock' | 'live'; quota: { projectSearchCalls: number; projectSearchLimit: number; userSearchCalls: number; userSearchLimit: number } }>> {
    const response = await apiClient.post('/lead-hunter/search', params);
    return response.data;
  },

  async enrichProfile(profile: IHunterProfile): Promise<IApiResponse<IHunterProfile>> {
    const response = await apiClient.post<IApiResponse<IHunterProfile>>('/lead-hunter/enrich', profile);
    return response.data;
  },
  async saveOpportunity(profile: IHunterProfile): Promise<any> {
    const response = await apiClient.post('/lead-hunter/opportunities', profile);
    return response.data.data;
  },
  async convertOpportunity(id: string): Promise<any> {
    const response = await apiClient.post(`/lead-hunter/opportunities/${id}/convert`);
    return response.data.data;
  },
};
