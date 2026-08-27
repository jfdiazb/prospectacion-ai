import type {
  ExternalLaunchEventInput,
  ExternalLaunchProvider,
  ExternalLaunchEventType,
} from '../types/launchExternalEvent';
import type { LaunchChannel } from '../types/launch';

const channelFor: Record<ExternalLaunchProvider, LaunchChannel> = {
  meta: 'instagram',
  whatsapp: 'whatsapp',
  youtube: 'youtube',
  tiktok: 'tiktok',
  form: 'manual',
  event_provider: 'manual',
  fixture: 'manual',
};
export class LaunchExternalEventFixtures {
  static event(
    provider: ExternalLaunchProvider,
    ownerId: string,
    options: Partial<ExternalLaunchEventInput> & { eventType?: ExternalLaunchEventType } = {}
  ): ExternalLaunchEventInput {
    const externalEventId = options.externalEventId || `${provider}-fixture-event`;
    const channel = options.channel || channelFor[provider];
    const timestamp = options.providerTimestamp || new Date();
    return {
      schemaVersion: 1,
      provider,
      eventType: options.eventType || 'provider_event',
      externalEventId,
      ownerId,
      channel,
      externalAccountId: options.externalAccountId || `${provider}-account`,
      externalParticipantId: options.externalParticipantId,
      providerTimestamp: timestamp,
      receivedAt: options.receivedAt || timestamp,
      verification: options.verification || {
        status: provider === 'fixture' ? 'not_required' : 'verified',
        method: provider === 'fixture' ? 'fixture' : 'provider',
        timestampToleranceMs: 300000,
      },
      correlationKey: options.correlationKey,
      normalizedPayload: options.normalizedPayload || {
        contentType: provider === 'form' ? 'form' : 'provider_event',
        referenceId: externalEventId,
      },
      evidence: options.evidence || {
        type: provider === 'form' ? 'form' : provider === 'fixture' ? 'fixture' : 'provider',
        source: `${provider}_mock`,
        channel,
        referenceId: externalEventId,
      },
      metadata: { fixture: true, ...(options.metadata || {}) },
    };
  }
  static meta(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('meta', ownerId, options);
  }
  static whatsapp(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('whatsapp', ownerId, options);
  }
  static youtube(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('youtube', ownerId, options);
  }
  static tiktok(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('tiktok', ownerId, options);
  }
  static form(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('form', ownerId, options);
  }
  static eventProvider(ownerId: string, options: Partial<ExternalLaunchEventInput> = {}) {
    return this.event('event_provider', ownerId, options);
  }
}
