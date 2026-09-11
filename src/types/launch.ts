export const launchStatuses = ['draft', 'scheduled', 'prelaunch', 'live', 'followup', 'completed', 'cancelled'] as const;
export type LaunchStatus = typeof launchStatuses[number];

export const launchChannels = ['whatsapp', 'instagram', 'facebook', 'youtube', 'tiktok', 'telegram', 'manual'] as const;
export type LaunchChannel = typeof launchChannels[number];

export const evidenceTypes = ['manual', 'form', 'provider', 'webhook', 'import', 'fixture', 'external', 'system'] as const;
export type EvidenceType = typeof evidenceTypes[number];
export interface LaunchEvidenceInput { type: EvidenceType; source?: string; channel?: LaunchChannel; referenceId?: string; recordedBy?: string; occurredAt?: Date; note?: string; metadata?: Record<string, string | number | boolean | null> }

export const participantDimensions = ['stage', 'invitation', 'registration', 'confirmation', 'attendance', 'outcome'] as const;
export type ParticipantDimension = typeof participantDimensions[number];
export const participantStates = {
  stage: ['selected', 'interested', 'followup', 'discarded', 'opted_out'],
  invitation: ['not_invited', 'proposed', 'invited', 'declined'],
  registration: ['unknown', 'pending', 'registered', 'cancelled'],
  confirmation: ['unknown', 'pending', 'confirmed', 'declined'],
  attendance: ['unknown', 'attended', 'no_show'],
  outcome: ['pending', 'information_requested', 'meeting_requested', 'converted', 'closed_lost'],
} as const;

export type ParticipantState<D extends ParticipantDimension> = typeof participantStates[D][number];

export interface CreateLaunchInput {
  name: string; description?: string; typeKey?: string; objective?: string; timezone: string;
  startsAt?: Date; eventStartsAt?: Date; eventEndsAt?: Date; closesAt?: Date;
  targetSegment?: Record<string, unknown>; selectionMode?: 'manual' | 'assisted'; allowedChannels?: LaunchChannel[]; commercialContextId?: string;
  registrationConfig?: Record<string, unknown>; followUpConfig?: Record<string, unknown>; metricsConfig?: Record<string, unknown>;
  metadata?: Record<string, unknown>; idempotencyKey: string; actor: string;
}

export interface AddLaunchParticipantInput {
  launchId: string; leadId: string; conversationId?: string; source: string; entryChannel?: LaunchChannel;
  evidence?: LaunchEvidenceInput; metadata?: Record<string, unknown>; idempotencyKey: string; actor: string;
}

export interface ParticipantTransitionInput<D extends ParticipantDimension = ParticipantDimension> {
  participantId: string; dimension: D; status: ParticipantState<D>; evidence?: LaunchEvidenceInput;
  idempotencyKey: string; actor: string; reason?: string;
}

export const segmentFields = ['score', 'interest_level', 'status', 'normalized_intent', 'intent_history', 'tags', 'product_interest', 'business_interest', 'income_need', 'commercial_experience', 'commercial_affinity', 'origin', 'channel', 'recent_activity_days', 'last_contact_days', 'active_meeting', 'previous_participation'] as const;
export const segmentOperators = ['eq', 'neq', 'in', 'contains', 'gte', 'lte', 'exists'] as const;
export type SegmentField = typeof segmentFields[number];
export type SegmentOperator = typeof segmentOperators[number];
export interface SegmentRule { id: string; field: SegmentField; operator: SegmentOperator; value?: string | number | boolean | string[] }
export interface SegmentGroup { id: string; logic: 'AND' | 'OR'; rules: SegmentRule[]; groups?: SegmentGroup[] }
export interface TargetSegmentDefinition { schemaVersion: 1; logic: 'AND' | 'OR'; rules: SegmentRule[]; groups?: SegmentGroup[] }
