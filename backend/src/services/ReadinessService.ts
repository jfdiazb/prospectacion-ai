import mongoose from 'mongoose';
import { getAIRuntimeStatus } from '../integrations/ai';
import { isYouTubePollingEnabled } from './YouTubeIngestionService';
import InboundEvent from '../models/InboundEvent';
import OutboundMessage from '../models/OutboundMessage';
import AIInvocation from '../models/AIInvocation';

type ChannelMode = 'mock' | 'live';
const has = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));
const mode = (value: string | undefined): ChannelMode => value === 'live' ? 'live' : 'mock';

export class ReadinessService {
  static async inspect() {
    let database = mongoose.connection.readyState === 1;
    if (database) {
      try { await mongoose.connection.db?.admin().ping(); } catch { database = false; }
    }
    const verified: Record<string, { inbound: boolean; outbound: boolean }> = {
      whatsapp: { inbound: false, outbound: false },
      instagram: { inbound: false, outbound: false },
      facebook: { inbound: false, outbound: false },
      youtube: { inbound: false, outbound: false },
    };
    let aiVerified = false;
    if (database) {
      const channels = Object.keys(verified);
      const [inbound, outbound, completedAI] = await Promise.all([
        InboundEvent.distinct('channel', { channel: { $in: channels }, processingState: 'completed' }),
        OutboundMessage.distinct('channel', { channel: { $in: channels }, deliveryStatus: { $in: ['sent', 'delivered'] }, simulatedDelivery: { $ne: true } }),
        AIInvocation.exists({ provider: 'groq', status: 'completed' }),
      ]);
      for (const channel of inbound) if (verified[channel]) verified[channel].inbound = true;
      for (const channel of outbound) if (verified[channel]) verified[channel].outbound = true;
      aiVerified = Boolean(completedAI);
    }
    const essentialConfig = has('MONGO_URI', 'JWT_SECRET') &&
      (process.env.NODE_ENV !== 'production' || has('CORS_ORIGIN'));
    const whatsappMode = mode(process.env.WHATSAPP_MESSAGING_MODE);
    const instagramMode = mode(process.env.INSTAGRAM_MESSAGING_MODE || process.env.META_MESSAGING_MODE);
    const facebookMode = mode(process.env.FACEBOOK_MESSAGING_MODE || process.env.META_MESSAGING_MODE);
    const youtubeMode = mode(process.env.YOUTUBE_MESSAGING_MODE);
    const tiktokApproved = process.env.TIKTOK_API_APPROVED === 'true';
    const tiktokIngestionRequested = process.env.TIKTOK_INGESTION_ENABLED === 'true';
    const tiktokMessagingRequested = process.env.TIKTOK_MESSAGING_ENABLED === 'true';
    const globalRealOutboundEnabled =
      process.env.NODE_ENV !== 'production' || process.env.REAL_OUTBOUND_ENABLED === 'true';
    const effectiveOutbound = (channel: 'instagram' | 'facebook' | 'whatsapp' | 'youtube', configured: ChannelMode): ChannelMode => {
      const isolatedInstagramEnabled =
        channel === 'instagram' && process.env.INSTAGRAM_REAL_OUTBOUND_ENABLED === 'true';
      const isolatedFacebookEnabled =
        channel === 'facebook' && process.env.FACEBOOK_REAL_OUTBOUND_ENABLED === 'true';
      return configured === 'live' &&
        (globalRealOutboundEnabled || isolatedInstagramEnabled || isolatedFacebookEnabled)
        ? 'live'
        : 'mock';
    };
    const inboundStatus = (channel: keyof typeof verified, configured: boolean) =>
      !configured ? 'disabled' : verified[channel].inbound ? 'live' : 'pending';
    const outboundStatus = (channel: keyof typeof verified, configured: ChannelMode) =>
      configured === 'mock' ? 'mock' : verified[channel].outbound ? 'live' : 'pending';
    const ai = getAIRuntimeStatus();
    return {
      ready: database && essentialConfig,
      checks: { api: true, database, essentialConfig },
      runtime: {
        ai: { ...ai, verified: ai.provider === 'groq' ? aiVerified : ai.provider === 'mock' },
        providers: {
          whatsapp: { inbound: inboundStatus('whatsapp', has('WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID')), outbound: outboundStatus('whatsapp', effectiveOutbound('whatsapp', whatsappMode)), configured: whatsappMode === 'mock' || has('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'), automatic: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true' },
          instagram: { inbound: inboundStatus('instagram', has('META_APP_SECRET', 'META_VERIFY_TOKEN')), outbound: outboundStatus('instagram', effectiveOutbound('instagram', instagramMode)), configured: instagramMode === 'mock' || has('META_ACCESS_TOKEN', 'META_IG_USER_ID'), automatic: process.env.META_AUTO_SEND_ENABLED === 'true' },
          facebook: { inbound: inboundStatus('facebook', has('META_APP_SECRET', 'META_VERIFY_TOKEN')), outbound: outboundStatus('facebook', effectiveOutbound('facebook', facebookMode)), configured: facebookMode === 'mock' || has('META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'), automatic: process.env.META_AUTO_SEND_ENABLED === 'true' },
          youtube: { inbound: inboundStatus('youtube', isYouTubePollingEnabled()), outbound: outboundStatus('youtube', effectiveOutbound('youtube', youtubeMode)), configured: youtubeMode === 'mock' || has('YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'CRM_OWNER_ID') },
          // Flags express operator intent; they are not connectivity evidence. There is no
          // authenticated TikTok transport, webhook/poller or outbound provider in ALMA yet.
          tiktok: {
            inbound: tiktokApproved && tiktokIngestionRequested ? 'pending' : 'disabled',
            outbound: tiktokApproved && tiktokMessagingRequested ? 'pending' : 'disabled',
            configured: false,
            requested: tiktokApproved && (tiktokIngestionRequested || tiktokMessagingRequested),
            reason: tiktokApproved && (tiktokIngestionRequested || tiktokMessagingRequested)
              ? 'official_transport_not_configured'
              : 'official_capability_not_enabled',
          },
        },
      },
    };
  }
}
