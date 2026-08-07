import type { MessagingProvider } from './MessagingProvider';
import { MetaMessagingProvider } from './MetaMessagingProvider';
import { MockMessagingProvider } from './MockMessagingProvider';
import { YouTubeMessagingProvider } from './YouTubeMessagingProvider';

export const getMessagingProvider = (channel: 'instagram' | 'whatsapp' | 'youtube' = 'youtube'): MessagingProvider => {
  const mode = channel === 'youtube' ? (process.env.YOUTUBE_MESSAGING_MODE || 'mock')
    : channel === 'whatsapp' ? (process.env.WHATSAPP_MESSAGING_MODE || 'live') : (process.env.INSTAGRAM_MESSAGING_MODE || process.env.META_MESSAGING_MODE || 'mock');
  if (mode === 'mock') return new MockMessagingProvider();
  if (mode === 'live') return channel === 'youtube' ? new YouTubeMessagingProvider() : new MetaMessagingProvider();
  throw new Error(`Modo de mensajería inválido para ${channel}: ${mode}`);
};

export * from './MessagingProvider';
