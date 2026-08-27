import type { LaunchChannel, LaunchEvidenceInput } from './launch';

export const externalLaunchProviders = [
  'meta',
  'whatsapp',
  'youtube',
  'tiktok',
  'form',
  'event_provider',
  'fixture',
] as const;
export type ExternalLaunchProvider = (typeof externalLaunchProviders)[number];
export const externalLaunchEventTypes = [
  'registration',
  'confirmation',
  'attendance',
  'no_show',
  'comment',
  'direct_message',
  'form_submit',
  'click',
  'provider_event',
] as const;
export type ExternalLaunchEventType = (typeof externalLaunchEventTypes)[number];
export const externalLaunchEventStates = [
  'received',
  'validated',
  'normalized',
  'processed',
  'ignored',
  'pending_review',
  'failed',
] as const;
export type ExternalLaunchEventState = (typeof externalLaunchEventStates)[number];
export const verificationStatuses = ['verified', 'unverified', 'failed', 'not_required'] as const;
export type ExternalVerificationStatus = (typeof verificationStatuses)[number];

export interface ExternalLaunchEventInput {
  schemaVersion: 1;
  provider: ExternalLaunchProvider;
  eventType: ExternalLaunchEventType;
  externalEventId: string;
  ownerId: string;
  channel: LaunchChannel;
  externalAccountId: string;
  externalParticipantId?: string;
  providerTimestamp: string | Date;
  receivedAt?: string | Date;
  verification: {
    status: ExternalVerificationStatus;
    method?: 'hmac' | 'token' | 'fixture' | 'provider';
    timestampToleranceMs?: number;
  };
  correlationKey?: string;
  normalizedPayload: {
    launchId?: string;
    participantId?: string;
    leadId?: string;
    conversationId?: string;
    attendanceStatus?: 'attended' | 'no_show';
    registrationStatus?: 'registered';
    confirmationStatus?: 'confirmed';
    contentType?: 'comment' | 'direct_message' | 'form' | 'provider_event' | 'click';
    referenceId?: string;
  };
  evidence: LaunchEvidenceInput;
  metadata?: Record<string, string | number | boolean | null>;
}

export interface NormalizedExternalLaunchEvent extends Omit<
  ExternalLaunchEventInput,
  'providerTimestamp' | 'receivedAt' | 'correlationKey'
> {
  providerTimestamp: Date;
  receivedAt: Date;
  correlationKey: string;
  payloadFingerprint: string;
}
