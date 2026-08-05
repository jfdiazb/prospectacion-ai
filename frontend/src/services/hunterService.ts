import { apiClient } from './api';
import type { IApiResponse, IHunterProfile } from '@types';

export const hunterService = {
  async searchProfiles(params: {
    keyword: string;
    platform: string;
    minFollowers?: number;
  }): Promise<IApiResponse<IHunterProfile[]>> {
    const response = await apiClient.post<IApiResponse<IHunterProfile[]>>('/lead-hunter/search', params);
    return response.data;
  },

  async enrichProfile(profile: IHunterProfile): Promise<IApiResponse<IHunterProfile>> {
    const response = await apiClient.post<IApiResponse<IHunterProfile>>('/lead-hunter/enrich', profile);
    return response.data;
  },
};
