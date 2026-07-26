import { apiClient } from './api';
import type { ILead, IApiResponse } from '@types';

/**
 * Servicio de Leads
 */
export const leadService = {
  async createLead(leadData: Partial<ILead>): Promise<ILead> {
    const { data } = await apiClient.post<IApiResponse<ILead>>('/leads', leadData);
    return data.data!;
  },

  async getLeads(page = 1, limit = 20) {
    const { data } = await apiClient.get<IApiResponse<any>>('/leads', {
      params: { page, limit },
    });
    return data.data;
  },

  async getLeadById(id: string): Promise<ILead> {
    const { data } = await apiClient.get<IApiResponse<ILead>>(`/leads/${id}`);
    return data.data!;
  },

  async updateLead(id: string, leadData: Partial<ILead>): Promise<ILead> {
    const { data } = await apiClient.put<IApiResponse<ILead>>(`/leads/${id}`, leadData);
    return data.data!;
  },

  async deleteLead(id: string): Promise<void> {
    await apiClient.delete(`/leads/${id}`);
  },

  async getHotLeads(): Promise<ILead[]> {
    const { data } = await apiClient.get<IApiResponse<ILead[]>>('/leads/hot');
    return data.data!;
  },

  async getLeadStats() {
    const { data } = await apiClient.get<IApiResponse<any>>('/leads/stats');
    return data.data;
  },

  async updateLeadStatus(id: string, status: string): Promise<ILead> {
    const { data } = await apiClient.put<IApiResponse<ILead>>(`/leads/${id}/status`, { status });
    return data.data!;
  },

  async advancedSearch(filters: any) {
    const { data } = await apiClient.post<IApiResponse<ILead[]>>('/leads/search', filters);
    return data.data!;
  },
};
