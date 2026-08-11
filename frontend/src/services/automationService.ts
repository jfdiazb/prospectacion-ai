import { apiClient } from './api';

export interface AutomationFlow { _id: string; name: string; description?: string; trigger: { type: string; keyword?: string }; actions: Array<{ type: string; message?: string }>; isActive: boolean; executionStats?: { totalExecutions?: number } }
export const automationService = {
  async list(): Promise<AutomationFlow[]> { const response = await apiClient.get('/automations'); return response.data.data; },
  async create(input: { name: string; keyword: string; message: string; description?: string }): Promise<AutomationFlow> { const response = await apiClient.post('/automations', input); return response.data.data; },
  async toggle(id: string): Promise<AutomationFlow> { const response = await apiClient.patch(`/automations/${id}/toggle`); return response.data.data; },
  async remove(id: string): Promise<void> { await apiClient.delete(`/automations/${id}`); },
};
