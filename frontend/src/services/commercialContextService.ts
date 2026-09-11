import { apiClient } from './api';

export interface CommercialContextSummary { _id: string; brandName: string; businessType?: string; commercialLines: string[]; status: 'active' | 'inactive'; version: number }
export const commercialContextService = {
  async active(): Promise<CommercialContextSummary> { const response = await apiClient.get('/commercial-context/active'); return response.data.data; },
};
