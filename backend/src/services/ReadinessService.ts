import mongoose from 'mongoose';
import { getAIRuntimeStatus } from '../integrations/ai';

type ChannelMode = 'mock' | 'live';
const has = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));
const mode = (value: string | undefined): ChannelMode => value === 'live' ? 'live' : 'mock';

export class ReadinessService {
  static async inspect() {
    let database = mongoose.connection.readyState === 1;
    if (database) {
      try { await mongoose.connection.db?.admin().ping(); } catch { database = false; }
    }
    const essentialConfig = has('MONGO_URI', 'JWT_SECRET') &&
      (process.env.NODE_ENV !== 'production' || has('CORS_ORIGIN'));
    const whatsappMode = mode(process.env.WHATSAPP_MESSAGING_MODE);
    const instagramMode = mode(process.env.INSTAGRAM_MESSAGING_MODE || process.env.META_MESSAGING_MODE);
    const facebookMode = mode(process.env.FACEBOOK_MESSAGING_MODE || process.env.META_MESSAGING_MODE);
    const youtubeMode = mode(process.env.YOUTUBE_MESSAGING_MODE);
    const tiktokApproved = process.env.TIKTOK_API_APPROVED === 'true';
    return {
      ready: database && essentialConfig,
      checks: { api: true, database, essentialConfig },
      runtime: {
        ai: getAIRuntimeStatus(),
        providers: {
          whatsapp: { inbound: has('WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID'), outbound: whatsappMode, configured: whatsappMode === 'mock' || has('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'), automatic: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true' },
          instagram: { inbound: has('META_APP_SECRET', 'META_VERIFY_TOKEN'), outbound: instagramMode, configured: instagramMode === 'mock' || has('META_ACCESS_TOKEN', 'META_IG_USER_ID'), automatic: process.env.META_AUTO_SEND_ENABLED === 'true' },
          facebook: { inbound: has('META_APP_SECRET', 'META_VERIFY_TOKEN'), outbound: facebookMode, configured: facebookMode === 'mock' || has('META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'), automatic: process.env.META_AUTO_SEND_ENABLED === 'true' },
          youtube: { inbound: mode(process.env.YOUTUBE_INGESTION_MODE), outbound: youtubeMode, configured: youtubeMode === 'mock' || has('YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'CRM_OWNER_ID') },
          tiktok: { inbound: tiktokApproved && process.env.TIKTOK_INGESTION_ENABLED === 'true' ? 'live' : 'disabled', outbound: tiktokApproved && process.env.TIKTOK_MESSAGING_ENABLED === 'true' ? 'live' : 'disabled', configured: tiktokApproved },
        },
      },
    };
  }
}
