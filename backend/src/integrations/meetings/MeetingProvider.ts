export interface MeetingRequest { topic: string; scheduledFor?: Date; timezone: string; durationMinutes?: number; agenda?: string }
export interface MeetingResult { externalId: string; joinUrl: string; startUrl?: string; simulated: boolean; scheduledFor?: Date }
export interface MeetingProvider { readonly name: string; createMeeting(request: MeetingRequest): Promise<MeetingResult>; updateMeeting?(externalId: string, request: MeetingRequest): Promise<MeetingResult>; cancelMeeting?(externalId: string): Promise<void> }

export class MeetingProviderError extends Error {
  constructor(message: string, public readonly code: string, public readonly status?: number) {
    super(message);
    this.name = 'MeetingProviderError';
  }
}
