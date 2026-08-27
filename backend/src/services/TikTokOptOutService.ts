import AssistedProposal from '../models/AssistedProposal';
import Lead from '../models/Lead';
import LaunchParticipant from '../models/LaunchParticipant';
import { LaunchActionService } from './LaunchActionService';
import { LaunchDomainError } from './LaunchDomainError';
import { LaunchLifecycleService } from './LaunchLifecycleService';
import { MultichannelIdentityService } from './MultichannelIdentityService';

const optOutPattern =
  /\b(no (?:quiero|deseo) continuar|no me contactes|deja de escribir|no contactar|stop|unsubscribe)\b/i;

export class TikTokOptOutService {
  static matches(text: string) {
    return optOutPattern.test(text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  }

  static async apply(userId: string, leadId: string, eventId: string, occurredAt: Date) {
    await Lead.updateOne(
      { _id: leadId, userId },
      { $set: { status: 'rejected' }, $addToSet: { tags: 'opt_out' } }
    );
    const contact = await MultichannelIdentityService.contactForLead(userId, leadId);
    if (contact)
      await MultichannelIdentityService.setGeneralOptOut(
        userId,
        contact.contact._id.toString(),
        true,
        'tiktok_inbound',
        'explicit_tiktok_opt_out'
      );
    else
      await AssistedProposal.updateMany(
        { userId, leadId, status: { $in: ['proposed', 'failed'] } },
        {
          $set: {
            status: 'cancelled',
            invalidatedAt: occurredAt,
            invalidationReason: 'explicit_tiktok_opt_out',
          },
        }
      );
    const participants: any[] = await LaunchParticipant.find({
      userId,
      leadId,
      'stage.status': { $in: ['selected', 'interested', 'followup'] },
    }).lean();
    for (const participant of participants)
      try {
        await LaunchLifecycleService.transitionParticipant(userId, {
          participantId: participant._id.toString(),
          dimension: 'stage',
          status: 'opted_out',
          evidence: {
            type: 'provider',
            source: 'tiktok_opt_out',
            channel: 'tiktok',
            referenceId: eventId,
            occurredAt,
          },
          idempotencyKey: `tiktok-optout:${eventId}:${participant._id}`,
          actor: 'tiktok_inbound',
          reason: 'explicit_tiktok_opt_out',
        });
      } catch (error) {
        if (
          !(error instanceof LaunchDomainError) ||
          !['LAUNCH_TERMINAL', 'INVALID_PARTICIPANT_TRANSITION'].includes(error.code)
        )
          throw error;
      }
    await LaunchActionService.reconcile(new Date());
  }
}
