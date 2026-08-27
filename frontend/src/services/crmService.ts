import apiClient from './api';

export interface CrmActivity { _id: string; description: string; createdAt: string; leadId?: { username?: string; fullName?: string } }
export interface CrmMeeting { _id: string; status: string; provider?: 'zoom' | 'calendly'; topic?: string; scheduledFor?: string; scheduledAt?: string; requestedAt?: string; timezone?: string; durationMinutes?: number; originChannel?: string; externalMeetingId?: string; joinUrl?: string; bookingUrl?: string; errorMessage?: string; errorCode?: string; outcome?: { type?: string; actor?: string; reason?: string; recordedAt?: string }; lifecycleHistory?: Array<{ status: string; at: string; reason?: string }>; leadId?: { username?: string; fullName?: string } }
export interface CrmProposal { _id: string; platform?: 'whatsapp' | 'instagram' | 'facebook'; purpose?: 'conversation_response' | 'follow_up' | 'reactivation' | 'automation' | 'meeting_scheduling' | 'meeting_reminder' | 'meeting_followup'; text: string; originalText: string; status: 'proposed' | 'sending' | 'sent' | 'failed' | 'cancelled'; errorMessage?: string; expiresAt?: string; invalidationReason?: string; createdAt: string }
export interface CrmConversation { _id: string; status: string; controlMode?: 'automated' | 'handoff_requested' | 'human_controlled'; handoffReason?: string; lastMessage?: string; leadId?: { _id?: string; username?: string; fullName?: string; platform?: string; source?: string; currentChannel?: string; origin?: { platform?: string; source?: string }; score?: number; interestLevel?: string; qualification?: any; nextFollowUp?: string; followUp?: { attempts?: number; lastFollowUpAt?: string; nextEligibleAt?: string; lastDecision?: string; lastReason?: string }; reactivation?: { attempts?: number; lastAttemptAt?: string; nextEligibleAt?: string; lastDecision?: string; lastReason?: string; lastResult?: string } }; identityContext?: { contactId: string; preferredChannel?: string; generalOptOut?: boolean; identities: Array<{ _id: string; platform: string; leadId: string; consentStatus: string }> }; latestQualification?: { previous?: { score?: number; status?: string; interestLevel?: string; normalizedIntent?: string }; current?: { score?: number; status?: string; interestLevel?: string; normalizedIntent?: string; meetingIntent?: string }; scoreDelta?: number; reasons?: string[]; evaluatorVersion?: string; evaluatedAt?: string }; proposedResponse?: CrmProposal; messages: Array<{ _id: string; sender: 'user' | 'lead' | 'ai'; text: string; timestamp: string; platform?: string; status?: string; processingError?: string }> }
export interface CrmTask { _id: string; title: string; description: string; type: 'follow_up' | 'meeting' | 'call' | 'email' | 'other'; status: 'pending' | 'completed' | 'cancelled'; dueDate?: string; priority?: 'low' | 'medium' | 'high'; leadId?: { username?: string; fullName?: string } }
export interface DuplicateCandidate { _id: string; signals: string[]; leadAId: { _id: string; username?: string; platform?: string }; leadBId: { _id: string; username?: string; platform?: string } }

export const crmService = {
  async activities(): Promise<CrmActivity[]> {
    const response = await apiClient.get('/crm/activities');
    return response.data.data;
  },
  async meetings(): Promise<CrmMeeting[]> {
    const response = await apiClient.get('/crm/meetings');
    return response.data.data;
  },
  async meetingAction(meetingId: string, action: 'retry' | 'cancel' | 'reschedule' | 'complete' | 'no-show' | 'technical-failure', body?: Record<string, unknown>): Promise<CrmMeeting> { const response = await apiClient.post(`/crm/meetings/${meetingId}/${action}`, body); return response.data.data; },
  async conversations(): Promise<CrmConversation[]> {
    const response = await apiClient.get('/crm/conversations');
    return response.data.data;
  },
  async tasks(): Promise<CrmTask[]> {
    const response = await apiClient.get('/crm/tasks');
    return response.data.data;
  },
  async duplicateCandidates(): Promise<DuplicateCandidate[]> { const response = await apiClient.get('/crm/duplicate-candidates'); return response.data.data; },
  async resolveDuplicate(id: string, action: 'confirm' | 'reject'): Promise<void> { await apiClient.post(`/crm/duplicate-candidates/${id}/${action}`); },
  async setPreferredChannel(contactId: string, channel: string | null): Promise<void> { await apiClient.post(`/crm/contacts/${contactId}/preferred-channel`, { channel }); },
  async setGeneralOptOut(contactId: string, optedOut: boolean): Promise<void> { await apiClient.post(`/crm/contacts/${contactId}/opt-out`, { optedOut }); },
  async setIdentityConsent(identityId: string, status: 'unknown' | 'consented' | 'opted_out' | 'blocked'): Promise<void> { await apiClient.post(`/crm/identities/${identityId}/consent`, { status }); },
  async unlinkIdentity(identityId: string): Promise<void> { await apiClient.post(`/crm/identities/${identityId}/unlink`); },
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
  async editProposal(conversationId: string, proposalId: string, text: string): Promise<CrmProposal> {
    const response = await apiClient.patch(`/crm/conversations/${conversationId}/proposals/${proposalId}`, { text });
    return response.data.data;
  },
  async sendProposal(conversationId: string, proposalId: string): Promise<CrmProposal> {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/proposals/${proposalId}/send`);
    return response.data.data;
  },
  async discardProposal(conversationId: string, proposalId: string): Promise<CrmProposal> {
    const response = await apiClient.post(`/crm/conversations/${conversationId}/proposals/${proposalId}/discard`);
    return response.data.data;
  },
};
