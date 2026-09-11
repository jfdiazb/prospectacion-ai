import type { MeetingProvider } from './MeetingProvider';
import { MockZoomProvider } from './MockZoomProvider';
import { ZoomProvider } from './ZoomProvider';

export const getMeetingProvider = (): MeetingProvider => {
  const mode = process.env.ZOOM_MODE || 'mock';
  if (mode === 'mock') return new MockZoomProvider();
  if (mode === 'live') return new ZoomProvider();
  throw new Error(`ZOOM_MODE inválido: ${mode}`);
};

export * from './MeetingProvider';
