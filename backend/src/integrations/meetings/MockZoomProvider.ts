import { randomUUID } from 'crypto';
import type { MeetingProvider, MeetingRequest, MeetingResult } from './MeetingProvider';

export class MockZoomProvider implements MeetingProvider {
  readonly name = 'zoom-mock';
  async createMeeting(_request: MeetingRequest): Promise<MeetingResult> {
    const id = randomUUID();
    return { externalId: `mock-${id}`, joinUrl: `https://zoom.mock.invalid/j/${id}`, simulated: true };
  }
  async updateMeeting(externalId: string, request: MeetingRequest): Promise<MeetingResult> { return { externalId, joinUrl: `https://zoom.mock.invalid/j/${externalId}`, simulated: true, scheduledFor: request.scheduledFor }; }
  async cancelMeeting(_externalId: string): Promise<void> {}
}
