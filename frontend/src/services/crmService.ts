import apiClient from './api';

export interface CrmActivity { _id: string; description: string; createdAt: string; leadId?: { username?: string; fullName?: string } }
export interface CrmMeeting { _id: string; status: string; provider?: 'zoom' | 'calendly'; topic?: string; scheduledFor?: string; joinUrl?: string; bookingUrl?: string; leadId?: { username?: string; fullName?: string } }
export interface CrmConversation { _id: string; status: string; controlMode?: 'automated' | 'handoff_requested' | 'human_controlled'; handoffReason?: string; lastMessage?: string; leadId?: { username?: string; fullName?: string }; messages: Array<{ _id: string; sender: 'user' | 'lead' | 'ai'; text: string; timestamp: string; platform?: string }> }
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
  async setTaskStatus(taskId: string, status: 'pending' | 'completed'): Promise<CrmTask> {
    const response = await apiClient.patch(`/crm/tasks/${taskId}/status`, { status });
    return response.data.data;
  },
  async setConversationControl(conversationId: string, action: 'take' | 'resume'): Promise<CrmConversation> {
    const response = await apiClient.patch(`/crm/conversations/${conversationId}/control`, { action });
    return response.data.data;
  },
  async sendHumanMessage(conversationId: string, text: string): Promise<CrmConversation> {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/messages`, { text });
    return response.data.data;
  },
};
