import apiClient from './api';

export interface YouTubeStatus {
  connected: boolean;
  credential?: { channelId: string; channelTitle?: string; connectedAt: string; lastPolledAt?: string } | null;
}

export interface OperationalDiagnostics {
  checkedAt: string;
  youtube: {
    connected: boolean; channelTitle?: string; lastPolledAt?: string; lastRepliesPolledAt?: string;
    polling?: { receivedThreads?: number; afterCutoff?: number; processed?: number; duplicate?: number };
    replies?: { activeThreads?: number; replies?: number; processed?: number; not_eligible?: number; duplicate?: number };
  };
  calendly: {
    configured: boolean; schedulingMode: string; pendingBooking: number; futureScheduled: number;
    expiredScheduled: number; failed: number; latestCalendly?: { scheduledFor?: string; updatedAt?: string } | null;
  };
  alerts: Array<{ severity: 'healthy' | 'info' | 'warning' | 'error'; code: string; message: string }>;
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
  async getDiagnostics(): Promise<OperationalDiagnostics> {
    const response = await apiClient.get('/youtube/diagnostics');
    return response.data.data;
  },
};
