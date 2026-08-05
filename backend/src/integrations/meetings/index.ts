import type { MeetingProvider } from './MeetingProvider';
import { MockZoomProvider } from './MockZoomProvider';
import { ZoomProvider } from './ZoomProvider';

export const getMeetingProvider = (): MeetingProvider => {
  const configured = process.env.ZOOM_CLIENT_ID && process.env.ZOOM_CLIENT_SECRET && process.env.ZOOM_ACCOUNT_ID;
  return configured && process.env.ZOOM_MODE === 'live' ? new ZoomProvider() : new MockZoomProvider();
};
