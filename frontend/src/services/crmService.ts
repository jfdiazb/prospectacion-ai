import apiClient from './api';

export interface CrmActivity { _id: string; description: string; createdAt: string; leadId?: { username?: string; fullName?: string } }
export interface CrmMeeting { _id: string; status: string; topic?: string; leadId?: { username?: string; fullName?: string } }
export interface CrmConversation { _id: string; status: string; lastMessage?: string; leadId?: { username?: string; fullName?: string }; messages: Array<{ _id: string; sender: 'user' | 'lead' | 'ai'; text: string; timestamp: string }> }
export interface CrmTask { _id: string; title: string; description: string; type: 'follow_up' | 'meeting' | 'call' | 'email' | 'other'; status: 'pending' | 'completed' | 'cancelled'; dueDate?: string; priority?: 'low' | 'medium' | 'high'; leadId?: { username?: string; fullName?: string } }

export const crmService = {
  async activities(): Promise<CrmActivity[]> {
    const response = await apiClient.get('/crm/activities');
    return response.data.data;
  },
  async meetings(): Promise<CrmMeeting[]> {
    const response = await apiClient.get('/crm/meetings');
    return response.data.data;
  },
  async conversations(): Promise<CrmConversation[]> {
    const response = await apiClient.get('/crm/conversations');
    return response.data.data;
  },
  async tasks(): Promise<CrmTask[]> {
    const response = await apiClient.get('/crm/tasks');
    return response.data.data;
  },
};
