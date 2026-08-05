import type { MeetingProvider, MeetingRequest, MeetingResult } from './MeetingProvider';

export class ZoomProvider implements MeetingProvider {
  readonly name = 'zoom';
  async createMeeting(_request: MeetingRequest): Promise<MeetingResult> {
    throw new Error('Zoom real está preparado pero deshabilitado hasta implementar y autorizar OAuth');
  }
}
