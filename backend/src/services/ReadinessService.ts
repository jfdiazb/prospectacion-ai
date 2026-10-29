import mongoose from 'mongoose';
import { getAIRuntimeStatus } from '../integrations/ai';
import { isYouTubePollingEnabled } from './YouTubeIngestionService';
import InboundEvent from '../models/InboundEvent';
import OutboundMessage from '../models/OutboundMessage';
import AIInvocation from '../models/AIInvocation';
import { ChannelCredentialStateService } from './ChannelCredentialStateService';

type ChannelMode = 'mock' | 'live';
const has = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));
const mode = (value: string | undefined): ChannelMode => value === 'live' ? 'live' : 'mock';

export class ReadinessService {
  static async inspect() {
    let database = mongoose.connection.readyState === 1;
    if (database) {
      try { await mongoose.connection.db?.admin().ping(); } catch { database = false; }
    }
    const verified: Record<string, { inbound: boolean; generated: boolean; accepted: boolean; confirmed: boolean }> = {
      whatsapp: { inbound: false, generated: false, accepted: false, confirmed: false },
      instagram: { inbound: false, generated: false, accepted: false, confirmed: false },
      facebook: { inbound: false, generated: false, accepted: false, confirmed: false },
      youtube: { inbound: false, generated: false, accepted: false, confirmed: false },
    };
    let aiVerified = false;
    if (database) {
      const channels = Object.keys(verified);
      const [inbound, generated, accepted, confirmed, completedAI] = await Promise.all([
        InboundEvent.distinct('channel', { channel: { $in: channels }, processingState: 'completed' }),
        OutboundMessage.distinct('channel', {
          channel: { $in: channels },
          deliveryStatus: { $in: ['generated', 'queued', 'sent', 'confirmed', 'failed', 'unknown', 'simulated', 'pending', 'delivered'] },
        }),
        OutboundMessage.distinct('channel', {
          channel: { $in: channels },
          deliveryStatus: { $in: ['sent', 'confirmed', 'delivered'] },
          simulatedDelivery: { $ne: true },
        }),
        OutboundMessage.distinct('channel', {
          channel: { $in: channels },
          deliveryStatus: { $in: ['confirmed', 'delivered'] },
          simulatedDelivery: { $ne: true },
        }),
        AIInvocation.exists({ provider: 'groq', status: 'completed' }),
      ]);
      for (const channel of inbound) if (verified[channel]) verified[channel].inbound = true;
      for (const channel of generated) if (verified[channel]) verified[channel].generated = true;
      for (const channel of accepted) if (verified[channel]) verified[channel].accepted = true;
      for (const channel of confirmed) if (verified[channel]) verified[channel].confirmed = true;
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
    const credentialFingerprints = {
      whatsapp: ChannelCredentialStateService.fingerprint('whatsapp'),
      instagram: ChannelCredentialStateService.fingerprint('instagram'),
      facebook: ChannelCredentialStateService.fingerprint('facebook'),
      youtube: ChannelCredentialStateService.fingerprint('youtube'),
    };
    const credentialBlocked = database ? {
      whatsapp: await ChannelCredentialStateService.blocked('whatsapp', credentialFingerprints.whatsapp),
      instagram: await ChannelCredentialStateService.blocked('instagram', credentialFingerprints.instagram),
      facebook: await ChannelCredentialStateService.blocked('facebook', credentialFingerprints.facebook),
      youtube: await ChannelCredentialStateService.blocked('youtube', credentialFingerprints.youtube),
    } : { whatsapp: false, instagram: false, facebook: false, youtube: false };
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
      configured === 'mock' ? 'mock' : verified[channel].confirmed ? 'live' : 'pending';
    const certification = (channel: keyof typeof verified, configured: boolean, blocked: boolean) => ({
      connectivity: verified[channel].inbound || verified[channel].accepted,
      credentials: blocked ? 'invalid' : verified[channel].accepted || verified[channel].confirmed ? 'verified' : configured ? 'unverified' : 'missing',
      realReception: verified[channel].inbound,
      responseGenerated: verified[channel].generated,
      providerAccepted: verified[channel].accepted,
      externallyConfirmed: verified[channel].confirmed,
      operational: configured && !blocked && verified[channel].inbound && verified[channel].confirmed,
    });
    const ai = getAIRuntimeStatus();
    const technicalReady = database && essentialConfig;
    const behavioralSuiteVersion = 'behavioral-commercial-v1';
    const deployedCommit = process.env.RENDER_GIT_COMMIT?.trim() || process.env.GIT_COMMIT?.trim();
    const certifiedCommit = process.env.RELEASE_COMMIT?.trim();
    const commitMatches = Boolean(deployedCommit && certifiedCommit && deployedCommit === certifiedCommit);
    const behavioralReady = process.env.BEHAVIORAL_CERTIFICATION_VERSION === behavioralSuiteVersion &&
      process.env.BEHAVIORAL_CERTIFICATION_STATUS === 'passed' && commitMatches;
    const providerConfig = {
      whatsapp: whatsappMode === 'mock' || has('WHATSAPP_TOKEN', 'WHATSAPP_PHONE_NUMBER_ID'),
      instagram: instagramMode === 'mock' || has('META_ACCESS_TOKEN', 'META_IG_USER_ID'),
      facebook: facebookMode === 'mock' || has('META_PAGE_ACCESS_TOKEN', 'META_PAGE_ID'),
      youtube: youtubeMode === 'mock' || has('YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET', 'CRM_OWNER_ID'),
    };
    const certifications = {
      whatsapp: certification('whatsapp', providerConfig.whatsapp, credentialBlocked.whatsapp),
      instagram: certification('instagram', providerConfig.instagram, credentialBlocked.instagram),
      facebook: certification('facebook', providerConfig.facebook, credentialBlocked.facebook),
      youtube: certification('youtube', providerConfig.youtube, credentialBlocked.youtube),
    };
    const effectiveModes = {
      whatsapp: effectiveOutbound('whatsapp', whatsappMode),
      instagram: effectiveOutbound('instagram', instagramMode),
      facebook: effectiveOutbound('facebook', facebookMode),
      youtube: effectiveOutbound('youtube', youtubeMode),
    } as const;
    const requiredLiveChannels = (process.env.REQUIRED_LIVE_CHANNELS || '')
      .split(',')
      .map(value => value.trim().toLowerCase())
      .filter((value): value is keyof typeof certifications => value in certifications);
    const enabledLiveChannels = Object.entries(effectiveModes)
      .filter(([, configured]) => configured === 'live')
      .map(([channel]) => channel as keyof typeof certifications);
    const certificationChannels = requiredLiveChannels.length > 0 ? requiredLiveChannels : enabledLiveChannels;
    const externallyConfirmedChannels = certificationChannels.filter(channel => certifications[channel].operational);
    const externalDeliveryCertified = certificationChannels.length > 0 &&
      externallyConfirmedChannels.length === certificationChannels.length;
    return {
      // `ready` remains the infrastructure health signal used by orchestrators.
      // Release authorization is deliberately stricter and exposed as `goLive`.
      ready: technicalReady,
      technicalReady,
      behavioralReady,
      goLive: technicalReady && behavioralReady && externalDeliveryCertified,
      externalDeliveryReady: externalDeliveryCertified,
      externalDeliveryCertified,
      requiredLiveChannels: certificationChannels,
      externalDeliveryCertification: {
        status: externalDeliveryCertified ? 'passed' : 'not_verified',
        evidenceRequired: 'provider-visible-confirmation',
        enabledChannels: certificationChannels,
        confirmedChannels: externallyConfirmedChannels,
        note: 'Las pruebas automatizadas y la aceptación API (sent) no confirman visibilidad externa.',
      },
      behavioralCertification: {
        status: behavioralReady ? 'passed' : 'missing_or_stale',
        suiteVersion: behavioralSuiteVersion,
        releaseCommit: certifiedCommit || null,
        deployedCommit: deployedCommit || null,
        commitMatches,
      },
      checks: { api: true, database, essentialConfig },
      runtime: {
        ai: { ...ai, verified: ai.provider === 'groq' ? aiVerified : ai.provider === 'mock' },
        providers: {
          whatsapp: { inbound: inboundStatus('whatsapp', has('WHATSAPP_APP_SECRET', 'WHATSAPP_PHONE_NUMBER_ID')), outbound: credentialBlocked.whatsapp ? 'blocked' : outboundStatus('whatsapp', effectiveOutbound('whatsapp', whatsappMode)), configured: providerConfig.whatsapp, credentialStatus: certifications.whatsapp.credentials, reconnectRequired: credentialBlocked.whatsapp, automatic: process.env.WHATSAPP_AUTO_REPLY_ENABLED === 'true', certification: certifications.whatsapp },
          instagram: { inbound: inboundStatus('instagram', has('META_APP_SECRET', 'META_VERIFY_TOKEN')), outbound: credentialBlocked.instagram ? 'blocked' : outboundStatus('instagram', effectiveOutbound('instagram', instagramMode)), configured: providerConfig.instagram, credentialStatus: certifications.instagram.credentials, reconnectRequired: credentialBlocked.instagram, automatic: process.env.META_AUTO_SEND_ENABLED === 'true', certification: certifications.instagram },
          facebook: { inbound: inboundStatus('facebook', has('META_APP_SECRET', 'META_VERIFY_TOKEN')), outbound: credentialBlocked.facebook ? 'blocked' : outboundStatus('facebook', effectiveOutbound('facebook', facebookMode)), configured: providerConfig.facebook, credentialStatus: certifications.facebook.credentials, reconnectRequired: credentialBlocked.facebook, automatic: process.env.FACEBOOK_AUTO_SEND_ENABLED === 'true', certification: certifications.facebook },
          youtube: { inbound: inboundStatus('youtube', isYouTubePollingEnabled()), outbound: credentialBlocked.youtube ? 'blocked' : outboundStatus('youtube', effectiveOutbound('youtube', youtubeMode)), configured: providerConfig.youtube, credentialStatus: certifications.youtube.credentials, reconnectRequired: credentialBlocked.youtube, certification: certifications.youtube },
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
