import { apiClient } from './api';
import type { IApiResponse, IScraperResult } from '@types';

export const scraperService = {
  async scrapeHashtag(hashtag: string): Promise<IApiResponse<IScraperResult>> {
    const response = await apiClient.post<IApiResponse<IScraperResult>>('/scraper/hashtag', { hashtag });
    return response.data;
  },

  async scrapeProfile(username: string, platform: string): Promise<IApiResponse<any>> {
    const response = await apiClient.post<IApiResponse<any>>('/scraper/profile', { username, platform });
    return response.data;
  },
};
