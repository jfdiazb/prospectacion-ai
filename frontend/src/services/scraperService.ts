import { apiClient } from './api';
import type { IApiResponse, IScraperResult, IScraperStatus } from '@types';

let statusRequest: Promise<IApiResponse<IScraperStatus>> | undefined;

export const scraperService = {
  status(): Promise<IApiResponse<IScraperStatus>> {
    if (!statusRequest) {
      statusRequest = apiClient
        .get<IApiResponse<IScraperStatus>>('/social-scraper/status')
        .then(response => response.data)
        .catch(error => {
          statusRequest = undefined;
          throw error;
        });
    }
    return statusRequest;
  },

  async scrapeHashtag(hashtag: string): Promise<IApiResponse<IScraperResult>> {
    const response = await apiClient.post<IApiResponse<IScraperResult>>('/social-scraper/hashtag', { hashtag });
    return response.data;
  },

  async scrapeProfile(username: string, platform: string): Promise<IApiResponse<any>> {
    const response = await apiClient.post<IApiResponse<any>>('/social-scraper/profile', { username, platform });
    return response.data;
  },
};
