import crypto from 'crypto';
import OutboundMessage from '../models/OutboundMessage';

export type OutboundChannel = 'instagram' | 'facebook' | 'whatsapp' | 'youtube';

const tokenFor = (channel: OutboundChannel): string | undefined => {
  if (channel === 'facebook') return process.env.META_PAGE_ACCESS_TOKEN;
  if (channel === 'instagram') return process.env.META_ACCESS_TOKEN;
  if (channel === 'whatsapp') return process.env.WHATSAPP_TOKEN;
  return process.env.YOUTUBE_ACCESS_TOKEN;
};

export class ChannelCredentialStateService {
  static fingerprint(channel: OutboundChannel): string | undefined {
    const token = tokenFor(channel)?.trim();
    if (!token) return undefined;
    return crypto.createHash('sha256').update(`${channel}:${token}`).digest('hex');
  }

  static async blocked(channel: OutboundChannel, credentialFingerprint?: string): Promise<boolean> {
    if (!credentialFingerprint) return false;
    return Boolean(await OutboundMessage.exists({
      channel,
      credentialFingerprint,
      requiresReauthorization: true,
      deliveryStatus: 'failed',
    }));
  }
}
