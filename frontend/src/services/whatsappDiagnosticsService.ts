import apiClient from './api';

export interface WhatsAppInboundDiagnostics {
  inboundEventCount: number;
  uniqueExternalEventCount: number;
  messagePersistenceCount: number;
  leadMatchCount: number;
  conversationMatchCount: number;
  events: Array<{ processingState?: string; processingAttempts?: number; conversationRecorded: boolean; eventTimestamp?: string; processedAt?: string }>;
  outboundMode: 'mock' | 'live';
  autoReplyEnabled: boolean;
}

export const whatsappDiagnosticsService = {
  async inbound(params: { from: string; to: string; textSha256: string }): Promise<WhatsAppInboundDiagnostics> {
    const response = await apiClient.get('/whatsapp/admin/inbound-diagnostics', { params });
    return response.data.data;
  },
};
