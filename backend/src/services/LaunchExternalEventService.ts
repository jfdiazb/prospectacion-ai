import LaunchExternalEvent from '../models/LaunchExternalEvent';
import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import ContactIdentity from '../models/ContactIdentity';
import ContactProfile from '../models/ContactProfile';
import LaunchEvent from '../models/LaunchEvent';
import { LaunchExternalEventContract } from './LaunchExternalEventContract';
import { LaunchOperationsService } from './LaunchOperationsService';
import type {
  ExternalLaunchEventInput,
  NormalizedExternalLaunchEvent,
} from '../types/launchExternalEvent';
import { LaunchDomainError } from './LaunchDomainError';

const strongOperations: Record<string, string> = {
  registration: 'register',
  confirmation: 'confirm',
  attendance: 'attendance',
  no_show: 'no_show',
};
export class LaunchExternalEventService {
  static async ingest(input: ExternalLaunchEventInput, now = new Date()) {
    const normalized = LaunchExternalEventContract.normalize(input, now);
    let event: any;
    try {
      event = await LaunchExternalEvent.create({
        userId: normalized.ownerId,
        ...normalized,
        status: 'normalized',
        attempts: 0,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      event = await LaunchExternalEvent.findOne({
        userId: normalized.ownerId,
        $or: [
          { correlationKey: normalized.correlationKey },
          {
            provider: normalized.provider,
            externalAccountId: normalized.externalAccountId,
            externalEventId: normalized.externalEventId,
          },
        ],
      });
      if (!event) throw error;
      if (event.payloadFingerprint && event.payloadFingerprint !== normalized.payloadFingerprint)
        throw new LaunchDomainError(
          'El eventId ya existe con un payload diferente',
          'EXTERNAL_EVENT_PAYLOAD_CONFLICT'
        );
      if (['processed', 'ignored', 'pending_review'].includes(event.status)) return event;
    }
    return this.process(event._id.toString(), normalized.ownerId, now);
  }

  static async retry(userId: string, eventId: string, now = new Date()) {
    return this.process(eventId, userId, now);
  }

  private static async associate(event: any) {
    const payload = event.normalizedPayload || {};
    if (!payload.launchId) return { resolved: false, reason: 'explicit_launch_required' };
    const participantQuery: any = { launchId: payload.launchId, userId: event.userId };
    if (payload.participantId) participantQuery._id = payload.participantId;
    else if (payload.leadId) participantQuery.leadId = payload.leadId;
    else if (event.externalParticipantId?.startsWith('sha256:'))
      participantQuery['metadata.externalInboundTokenHash'] = event.externalParticipantId.slice(7);
    else return { resolved: false, reason: 'deterministic_participant_reference_required' };
    const participant: any = await LaunchParticipant.findOne(participantQuery);
    if (!participant) return { resolved: false, reason: 'participant_not_found_for_owner_launch' };
    const launch: any = await Launch.findOne({ _id: payload.launchId, userId: event.userId });
    if (!launch) return { resolved: false, reason: 'launch_not_found_for_owner' };
    const policyControlled = [
      'signed_form_v1',
      'meta_launch_v1',
      'whatsapp_launch_v1',
      'youtube_launch_v1',
      'tiktok_launch_v1',
    ].includes(event.metadata?.ingestionProfile);
    if (policyControlled) {
      if (!['scheduled', 'prelaunch', 'live', 'followup'].includes(launch.status))
        return { resolved: false, reason: 'launch_not_active' };
      if (['discarded', 'opted_out'].includes(participant.stage?.status))
        return { resolved: false, reason: 'participant_not_active' };
      if (participant.registration?.status === 'cancelled')
        return { resolved: false, reason: 'participant_registration_cancelled' };
    }
    if (payload.leadId && payload.leadId.toString() !== participant.leadId.toString())
      return { resolved: false, reason: 'lead_mismatch' };
    if (!(await Lead.exists({ _id: participant.leadId, userId: event.userId })))
      return { resolved: false, reason: 'lead_not_found_for_owner' };
    const lead: any = await Lead.findOne({ _id: participant.leadId, userId: event.userId })
      .select('status tags')
      .lean();
    if (
      policyControlled &&
      (lead?.status === 'rejected' ||
        (lead?.tags || []).some((tag: string) =>
          ['opt_out', 'do_not_contact', 'no_contactar'].includes(tag.toLowerCase())
        ))
    )
      return { resolved: false, reason: 'lead_not_active' };
    if (policyControlled) {
      const identity: any = await ContactIdentity.findOne({
        userId: event.userId,
        leadId: participant.leadId,
        status: 'active',
      }).lean();
      if (identity) {
        const contact: any = await ContactProfile.findOne({
          _id: identity.contactId,
          userId: event.userId,
        }).lean();
        if (contact?.generalOptOut || ['opted_out', 'blocked'].includes(identity.consentStatus))
          return { resolved: false, reason: 'contact_not_active' };
      }
      if (
        event.metadata?.ingestionProfile === 'signed_form_v1' &&
        event.eventType === 'confirmation'
      ) {
        const formId = event.metadata?.formId;
        const configuredIds = launch.registrationConfig?.confirmationFormIds || [];
        if (!Array.isArray(configuredIds) || !configuredIds.includes(formId))
          return { resolved: false, reason: 'form_not_configured_for_confirmation' };
      }
    }
    if (
      payload.conversationId &&
      !(await Conversation.exists({
        _id: payload.conversationId,
        userId: event.userId,
        leadId: participant.leadId,
      }))
    )
      return { resolved: false, reason: 'conversation_mismatch' };
    return {
      resolved: true,
      launch,
      participant,
      leadId: participant.leadId,
      conversationId: payload.conversationId || participant.conversationId,
    };
  }

  private static async process(eventId: string, userId: string, now: Date) {
    const staleValidationBefore = new Date(now.getTime() - 5 * 60 * 1000);
    const claimed: any = await LaunchExternalEvent.findOneAndUpdate(
      {
        _id: eventId,
        userId,
        $or: [
          { status: { $in: ['received', 'normalized', 'failed'] } },
          { status: 'validated', lastAttemptAt: { $lte: staleValidationBefore } },
        ],
      },
      {
        $set: { status: 'validated', lastAttemptAt: now },
        $inc: { attempts: 1 },
        $unset: { error: 1 },
      },
      { new: true }
    );
    if (!claimed) return LaunchExternalEvent.findOne({ _id: eventId, userId });
    try {
      const association: any = await this.associate(claimed);
      if (!association.resolved) {
        const ignoredReasons = [
          'launch_not_active',
          'participant_not_active',
          'participant_registration_cancelled',
          'lead_not_active',
          'contact_not_active',
        ];
        const ignored = ignoredReasons.includes(association.reason);
        return LaunchExternalEvent.findOneAndUpdate(
          { _id: claimed._id, userId },
          {
            $set: {
              status: ignored ? 'ignored' : 'pending_review',
              ...(ignored ? { ignoredAt: now } : { pendingReviewAt: now }),
              association: { resolution: 'unresolved', reason: association.reason },
              ...(ignored
                ? { result: { operation: 'none', state: 'blocked_by_launch_policy' } }
                : {}),
            },
          },
          { new: true }
        );
      }
      const associationData = {
        launchId: association.launch._id,
        participantId: association.participant._id,
        leadId: association.leadId,
        conversationId: association.conversationId,
        resolution: 'explicit_ids',
        reason: 'owner_scoped_relationships_verified',
      };
      const operation = strongOperations[claimed.eventType];
      if (!operation)
        return LaunchExternalEvent.findOneAndUpdate(
          { _id: claimed._id, userId },
          {
            $set: {
              status: 'pending_review',
              pendingReviewAt: now,
              association: associationData,
              result: { operation: 'none', state: 'weak_interaction_requires_review' },
            },
          },
          { new: true }
        );
      const key = `external:${claimed.correlationKey}`;
      let participant: any;
      if (operation === 'register')
        participant = await LaunchOperationsService.register(
          userId,
          association.launch._id.toString(),
          association.participant._id.toString(),
          claimed.evidence,
          key,
          `provider:${claimed.provider}`
        );
      if (operation === 'confirm')
        participant = await LaunchOperationsService.confirm(
          userId,
          association.launch._id.toString(),
          association.participant._id.toString(),
          claimed.evidence,
          key,
          `provider:${claimed.provider}`
        );
      if (operation === 'attendance' || operation === 'no_show')
        participant = await LaunchOperationsService.attendance(
          userId,
          association.launch._id.toString(),
          association.participant._id.toString(),
          operation === 'attendance' ? 'attended' : 'no_show',
          claimed.evidence,
          key,
          `provider:${claimed.provider}`
        );
      const audit: any = await LaunchEvent.findOne({ userId, idempotencyKey: `operation:${key}` });
      return LaunchExternalEvent.findOneAndUpdate(
        { _id: claimed._id, userId },
        {
          $set: {
            status: 'processed',
            processedAt: now,
            association: associationData,
            result: {
              operation,
              state:
                participant?.[
                  operation === 'register'
                    ? 'registration'
                    : operation === 'confirm'
                      ? 'confirmation'
                      : 'attendance'
                ]?.status,
              launchEventId: audit?._id,
            },
          },
        },
        { new: true }
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'external_event_failed';
      return LaunchExternalEvent.findOneAndUpdate(
        { _id: claimed._id, userId },
        {
          $set: {
            status: 'failed',
            failedAt: now,
            error: { code: (error as any)?.code || 'PROCESSING_FAILED', message },
          },
        },
        { new: true }
      );
    }
  }
}
