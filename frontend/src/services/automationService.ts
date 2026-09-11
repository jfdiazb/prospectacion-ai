import { apiClient } from './api';
export type AutomationStatus = 'draft' | 'active' | 'paused' | 'disabled' | 'error';
export interface AutomationCondition { field: string; operator: string; value: unknown }
export interface AutomationAction { type: string; config?: Record<string, unknown> }
export interface AutomationFlow { _id: string; name: string; description?: string; status: AutomationStatus; trigger: { type: string; keyword?: string; keywords?: string[]; platform?: string }; conditionLogic?: 'AND' | 'OR'; conditions?: AutomationCondition[]; actions: AutomationAction[]; isActive: boolean; version?: number; lastRunAt?: string; executionStats?: { totalExecutions?: number; successfulExecutions?: number; failedExecutions?: number; lastExecution?: string } }
export interface AutomationExecution { _id: string; status: string; trigger: string; platform?: string; startedAt: string; finishedAt?: string; error?: string; steps: Array<{ index: number; type: string; status: string }> }
export type AutomationInput = Pick<AutomationFlow, 'name' | 'description' | 'trigger' | 'actions'> & { status?: AutomationStatus; conditionLogic?: 'AND' | 'OR'; conditions?: AutomationCondition[] };
export const automationService = {
  async list(filters: { status?: string; trigger?: string; search?: string } = {}): Promise<AutomationFlow[]> { const response = await apiClient.get('/automations', { params: filters }); return response.data.data; },
  async create(input: AutomationInput): Promise<AutomationFlow> { const response = await apiClient.post('/automations', input); return response.data.data; },
  async update(id: string, input: Partial<AutomationInput>): Promise<AutomationFlow> { const response = await apiClient.put(`/automations/${id}`, input); return response.data.data; },
  async setStatus(id: string, status: AutomationStatus): Promise<AutomationFlow> { const response = await apiClient.patch(`/automations/${id}/status`, { status }); return response.data.data; },
  async duplicate(id: string): Promise<AutomationFlow> { const response = await apiClient.post(`/automations/${id}/duplicate`); return response.data.data; },
  async remove(id: string): Promise<void> { await apiClient.delete(`/automations/${id}`); },
  async history(id: string): Promise<AutomationExecution[]> { const response = await apiClient.get(`/automations/${id}/executions`); return response.data.data; },
  async createInfoTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/info-qualification'); return response.data.data; },
  async createAdditionalIncomeTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/additional-income-assisted'); return response.data.data; },
  async createProductInterestTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/product-interest-assisted'); return response.data.data; },
  async createProductSalesTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/product-sales-assisted'); return response.data.data; },
  async createBusinessOpportunityTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/business-opportunity-assisted'); return response.data.data; },
  async createBusinessProductTemplate(): Promise<AutomationFlow> { const response = await apiClient.post('/automations/templates/business-product-assisted'); return response.data.data; },
};
