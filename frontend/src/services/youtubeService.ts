import apiClient from './api';

export interface YouTubeStatus {
  connected: boolean;
  credential?: { channelId: string; channelTitle?: string; connectedAt: string; lastPolledAt?: string } | null;
}

export const youtubeService = {
  async getStatus(): Promise<YouTubeStatus> {
    const response = await apiClient.get('/youtube/status');
    return response.data.data;
  },
  async connect(): Promise<void> {
    const response = await apiClient.get('/youtube/oauth/connect');
    window.location.assign(response.data.data.authorizationUrl);
  },
  async disconnect(): Promise<void> {
    await apiClient.delete('/youtube/connection');
  },
};
