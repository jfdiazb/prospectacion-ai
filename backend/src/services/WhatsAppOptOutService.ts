import AssistedProposal from '../models/AssistedProposal';
import Lead from '../models/Lead';
import { MultichannelIdentityService } from './MultichannelIdentityService';
import { LaunchLifecycleService } from './LaunchLifecycleService';
import LaunchParticipant from '../models/LaunchParticipant';
import { LaunchActionService } from './LaunchActionService';
import { LaunchDomainError } from './LaunchDomainError';

const optOutPattern =
  /\b(no (?:quiero|deseo) continuar|no me contactes|deja de escribir|no contactar|stop|unsubscribe)\b/i;
export class WhatsAppOptOutService {
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
        'whatsapp_inbound',
        'explicit_whatsapp_opt_out'
      );
    else
      await AssistedProposal.updateMany(
        { userId, leadId, status: { $in: ['proposed', 'failed'] } },
        {
          $set: {
            status: 'cancelled',
            invalidatedAt: occurredAt,
            invalidationReason: 'explicit_whatsapp_opt_out',
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
            type: 'webhook',
            source: 'whatsapp_opt_out',
            channel: 'whatsapp',
            referenceId: eventId,
            occurredAt,
          },
          idempotencyKey: `whatsapp-optout:${eventId}:${participant._id}`,
          actor: 'whatsapp_inbound',
          reason: 'explicit_whatsapp_opt_out',
        });
      } catch (error) {
        if (
          !(error instanceof LaunchDomainError) ||
          !['LAUNCH_TERMINAL', 'INVALID_PARTICIPANT_TRANSITION'].includes(error.code)
        )
          throw error;
        // The lead-level opt-out remains authoritative even for a terminal launch.
      }
    await LaunchActionService.reconcile(new Date());
  }
}
