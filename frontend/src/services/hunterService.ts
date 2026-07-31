import { apiClient } from './api';
import type { IApiResponse, IHunterProfile } from '@types';

export const hunterService = {
  async searchProfiles(params: {
    keyword: string;
    platform: string;
    minFollowers?: number;
  }): Promise<IApiResponse<IHunterProfile[]>> {
    const response = await apiClient.post<IApiResponse<IHunterProfile[]>>('/hunter/search', params);
    return response.data;
  },

  async enrichProfile(profile: IHunterProfile): Promise<IApiResponse<IHunterProfile>> {
    const response = await apiClient.post<IApiResponse<IHunterProfile>>('/hunter/enrich', profile);
    return response.data;
  },
};
