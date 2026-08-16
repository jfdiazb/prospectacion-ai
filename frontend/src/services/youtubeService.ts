import apiClient from './api';

export interface YouTubeStatus {
  connected: boolean;
  credential?: { channelId: string; channelTitle?: string; connectedAt: string; lastPolledAt?: string } | null;
}

export interface OperationalDiagnostics {
  checkedAt: string;
  youtube: {
    connected: boolean; channelTitle?: string; lastPolledAt?: string; lastRepliesPolledAt?: string;
    polling?: {
      receivedThreads?: number; topLevelComments?: number; cutoffAt?: string; afterCutoff?: number;
      processed?: number; processing_failed?: number; invalid?: number; own_channel?: number; not_eligible?: number; duplicate?: number;
      recordedAt?: string;
    };
    pollingFailure?: { httpStatus?: number; reason?: string; operation?: string; recordedAt?: string };
    replies?: { activeThreads?: number; polledThreads?: number; coverageCycleCount?: number; urgentThreads?: number; threadFailures?: number; replies?: number; processed?: number; not_eligible?: number; duplicate?: number };
  };
  calendly: {
    configured: boolean; schedulingMode: string; pendingBooking: number; futureScheduled: number;
    expiredScheduled: number; failed: number; latestCalendly?: { scheduledFor?: string; updatedAt?: string } | null;
  };
  alerts: Array<{ severity: 'healthy' | 'info' | 'warning' | 'error'; code: string; message: string }>;
}

export interface YouTubeMonitor {
  checkedAt: string; connected: boolean; channelTitle?: string; lastPolledAt?: string; lastRepliesPolledAt?: string;
  config: { activeDays: number; maxThreads: number; intervalMs: number; dailyQuota: number; responseAlertMinutes: number };
  activeThreadCount: number; monitoredThreadCount: number; uncoveredThreadCount: number; coverageCycleCount?: number; maxCoverageDelayMinutes?: number;
  lastReplySummary?: { activeThreads?: number; polledThreads?: number; coverageCycleCount?: number; urgentThreads?: number; threadFailures?: number; replies?: number; processed?: number; own_channel?: number; not_eligible?: number; duplicate?: number };
  lastProcessedCommentAt?: string;
  delivery: { sent: number; failed: number; pending: number; simulated: number };
  quota: { estimatedUnitsToday: number; dailyLimit: number; estimatedPercent: number; note: string };
  unanswered: { count: number; oldestAt?: string };
  errors: { oauth: number; quota: number; network: number; api: number };
  retryableFailures: Array<{ id: string; category: 'oauth' | 'quota' | 'network' | 'api'; code: string; failedAt?: string; retryCount: number; canRetry: boolean }>;
  threads: Array<{ position: number; monitored: boolean; lead: { name: string; status?: string; interestLevel?: string; score?: number } | null; conversationStatus?: string; lastActivityAt?: string; deliveryStatus: string }>;
  alerts: Array<{ severity: 'healthy' | 'warning' | 'error'; code: string; message: string }>;
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
  async getMonitor(): Promise<YouTubeMonitor> {
    const response = await apiClient.get('/youtube/monitor');
    return response.data.data;
  },
  async retryMessage(messageId: string): Promise<void> {
    await apiClient.post(`/youtube/monitor/messages/${messageId}/retry`);
  },
};
