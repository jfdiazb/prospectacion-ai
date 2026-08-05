export interface MeetingRequest { topic: string; scheduledFor?: Date; timezone: string }
export interface MeetingResult { externalId: string; joinUrl: string; simulated: boolean }
export interface MeetingProvider { readonly name: string; createMeeting(request: MeetingRequest): Promise<MeetingResult> }
