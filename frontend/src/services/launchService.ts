import apiClient from './api';

export type LaunchStatus =
  'draft' | 'scheduled' | 'prelaunch' | 'live' | 'followup' | 'completed' | 'cancelled';
export interface LaunchMetrics {
  selected: number;
  conversations: number;
  qualified: number;
  meetingReady: number;
  meetings: number;
  converted: number;
  closedLost: number;
  registered: number;
  confirmed: number;
  attended: number;
  notAttended: number;
  unknown: number;
  pendingActions?: number;
  meetingRequested?: number;
}
export interface Launch {
  _id: string;
  name: string;
  description?: string;
  objective?: string;
  typeKey: string;
  status: LaunchStatus;
  timezone: string;
  startsAt?: string;
  eventStartsAt?: string;
  eventEndsAt?: string;
  closesAt?: string;
  allowedChannels: string[];
  selectionMode: 'manual' | 'assisted';
  targetSegment?: SegmentDefinition;
  targetSegmentVersion?: number;
  lifecycleVersion: number;
  configurationVersion: number;
  registrationConfig?: Record<string, unknown>;
  followUpConfig?: Record<string, unknown>;
  metrics?: LaunchMetrics;
}
export interface SegmentRule {
  id: string;
  field: string;
  operator: string;
  value: unknown;
}
export interface SegmentDefinition {
  schemaVersion: 1;
  logic: 'AND' | 'OR';
  rules: SegmentRule[];
  groups: unknown[];
}
export interface SegmentPreviewItem {
  leadId: string;
  eligible: boolean;
  reasons: Array<{
    code: string;
    field?: string;
    matched: boolean;
    safety?: boolean;
    actual?: unknown;
    expected?: unknown;
  }>;
  lead?: {
    _id: string;
    fullName?: string;
    username?: string;
    currentChannel?: string;
    score?: number;
    interestLevel?: string;
  };
}
export interface LaunchParticipant {
  _id: string;
  leadId: string;
  source: string;
  entryChannel?: string;
  stage: { status: string };
  invitation: { status: string };
  registration: { status: string };
  confirmation: { status: string };
  attendance: { status: string };
  outcome: { status: string };
  nextAction?: { type?: string; dueAt?: string };
  qualifiedAt?: string;
  meetingReadiness?: { ready?: boolean; reason?: string; evaluatedAt?: string };
  lead?: {
    _id: string;
    fullName?: string;
    username?: string;
    currentChannel?: string;
    platform?: string;
    score?: number;
    interestLevel?: string;
    normalizedIntent?: string;
    status?: string;
    tags?: string[];
  };
  meeting?: {
    _id: string;
    status: string;
    scheduledFor?: string;
    scheduledAt?: string;
    provider?: string;
  };
  pendingAction?: LaunchAction;
  identitySafety?: {
    consentStatus?: string;
    preferredChannel?: string;
    generalOptOut?: boolean;
    blocked?: boolean;
  };
}
export interface LaunchAction {
  _id: string;
  kind: string;
  status: string;
  triggerType?: string;
  proposedChannel?: string;
  priority: string;
  dueAt: string;
  expiresAt?: string;
  reason?: string;
  invalidationReason?: string;
  leadId?: LaunchParticipant['lead'];
  taskId?: { _id: string; title: string; status: string; dueDate?: string };
  proposalId?: {
    _id: string;
    text: string;
    status: string;
    platform: string;
    expiresAt?: string;
    invalidationReason?: string;
    conversationId?: string;
  };
}
export interface LaunchEvent {
  _id: string;
  eventType: string;
  source: string;
  actor: string;
  occurredAt: string;
  evidence?: { type?: string; note?: string };
  metadata?: Record<string, unknown>;
}
export interface LaunchDetail {
  launch: Launch;
  metrics: LaunchMetrics;
  participants: LaunchParticipant[];
  actions: LaunchAction[];
  events: LaunchEvent[];
}
export type LaunchInput = Partial<Launch> & {
  name: string;
  timezone: string;
  idempotencyKey: string;
};

const data = <T>(response: { data: { data: T } }) => response.data.data;
export const launchService = {
  async list(filters: Record<string, string | undefined> = {}): Promise<Launch[]> {
    return data(await apiClient.get('/launches', { params: filters }));
  },
  async detail(id: string): Promise<LaunchDetail> {
    return data(await apiClient.get(`/launches/${id}`));
  },
  async create(input: LaunchInput): Promise<Launch> {
    return data(await apiClient.post('/launches', input));
  },
  async update(id: string, input: Partial<LaunchInput>): Promise<Launch> {
    return data(await apiClient.patch(`/launches/${id}`, input));
  },
  async transition(id: string, status: LaunchStatus, reason?: string): Promise<Launch> {
    return data(
      await apiClient.post(`/launches/${id}/transition`, {
        status,
        reason,
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async saveSegment(id: string, definition: SegmentDefinition): Promise<{ version: number }> {
    return data(
      await apiClient.put(`/launches/${id}/segment`, { definition, reason: 'Edición desde CRM' })
    );
  },
  async previewSegment(id: string): Promise<{ items: SegmentPreviewItem[]; version: number }> {
    return data(
      await apiClient.post(`/launches/${id}/segment/preview`, {
        page: 1,
        limit: 100,
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async select(
    id: string,
    version: number,
    decisions: Array<{ leadId: string; action: 'include' | 'exclude'; reason?: string }>
  ): Promise<unknown> {
    return data(
      await apiClient.post(`/launches/${id}/participants/select`, {
        segmentVersion: version,
        decisions,
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async addManual(id: string, leadId: string, reason: string): Promise<unknown> {
    return data(
      await apiClient.post(`/launches/${id}/participants/manual`, {
        leadId,
        reason,
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async operation(
    launchId: string,
    participantId: string,
    operation: 'register' | 'confirm',
    note: string
  ): Promise<unknown> {
    return data(
      await apiClient.post(`/launches/${launchId}/participants/${participantId}/${operation}`, {
        evidence: { type: 'manual', source: 'crm', note, occurredAt: new Date().toISOString() },
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async attendance(
    launchId: string,
    participantId: string,
    status: 'attended' | 'no_show' | 'unknown',
    note: string,
    reason?: string
  ): Promise<unknown> {
    return data(
      await apiClient.post(`/launches/${launchId}/participants/${participantId}/attendance`, {
        status,
        reason,
        evidence: { type: 'manual', source: 'crm', note, occurredAt: new Date().toISOString() },
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
  async correct(
    launchId: string,
    participantId: string,
    dimension: 'registration' | 'confirmation',
    note: string,
    reason: string
  ): Promise<unknown> {
    return data(
      await apiClient.post(`/launches/${launchId}/participants/${participantId}/correct`, {
        dimension,
        reason,
        evidence: { type: 'manual', source: 'crm', note, occurredAt: new Date().toISOString() },
        idempotencyKey: crypto.randomUUID(),
      })
    );
  },
};
