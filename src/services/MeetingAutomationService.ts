import Meeting from '../models/Meeting';
import MeetingAction from '../models/MeetingAction';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import Task from '../models/Task';
import AssistedProposal from '../models/AssistedProposal';
import Activity from '../models/Activity';
import { FollowUpPolicyService } from './FollowUpService';
import { TaskService } from './TaskService';
import { ConversationService } from './ConversationService';
import { CommercialContextService } from './CommercialContextService';
import { MeetingAvailabilityService } from './MeetingAvailabilityService';
import { AutomationEngineService } from './AutomationEngineService';
import { getAIProvider } from '../integrations/ai';
import { AlmaService } from './AlmaService';
import { MultichannelIdentityService } from './MultichannelIdentityService';

export class MeetingAutomationPolicyService {
  static reminderWindows(): number[] { return [...new Set((process.env.MEETING_REMINDER_WINDOWS_MINUTES || '1440,60').split(',').map(Number).filter(value => Number.isFinite(value) && value > 0))].sort((a, b) => b - a); }
  static minLeadMinutes(): number { return Math.max(0, Number(process.env.MEETING_REMINDER_MIN_LEAD_MINUTES || 10)); }
  static optionsTtlMs(): number { return Math.max(3600000, Number(process.env.MEETING_OPTIONS_TTL_MS || 86400000)); }
  static followupDelayMs(): number { return Math.max(0, Number(process.env.MEETING_POST_FOLLOWUP_DELAY_MS || 3600000)); }
  static proposalTtlMs(): number { return Math.max(3600000, Number(process.env.MEETING_PROPOSAL_TTL_MS || 86400000)); }
  static reviewGraceMs(): number { return Math.max(0, Number(process.env.MEETING_OUTCOME_REVIEW_GRACE_MS || 3600000)); }

  static async eligible(lead: any, conversation: any): Promise<{ eligible: boolean; reason?: string }> {
    if (FollowUpPolicyService.isOptOut(lead, conversation)) return { eligible: false, reason: 'opt_out_or_rejected' };
    if (conversation.status === 'closed') return { eligible: false, reason: 'conversation_closed' };
    if (conversation.controlMode === 'handoff_requested') return { eligible: false, reason: 'handoff_requested' };
    if (conversation.controlMode === 'human_controlled') return { eligible: false, reason: 'human_controlled' };
    return { eligible: true };
  }
}

export class MeetingAutomationService {
  static async process(limit = 30, now = new Date()): Promise<number> {
    await this.materialize(now);
    let processed = 0;
    while (processed < limit) {
      const stale = new Date(now.getTime() - 5 * 60000);
      const action: any = await MeetingAction.findOneAndUpdate({ $or: [{ status: 'pending', dueAt: { $lte: now } }, { status: 'processing', lockedAt: { $lte: stale } }] }, { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } }, { new: true, sort: { dueAt: 1 } });
      if (!action) break;
      try { await this.execute(action, now); }
      catch (error) { const message = error instanceof Error ? error.message.slice(0, 500) : 'meeting_action_failed'; await MeetingAction.updateOne({ _id: action._id, status: 'processing' }, action.attempts >= 3 ? { $set: { status: 'failed', lastError: message } } : { $set: { status: 'pending', dueAt: new Date(now.getTime() + 60000), lastError: message }, $unset: { lockedAt: 1 } }); }
      processed++;
    }
    return processed;
  }

  static async materialize(now = new Date()): Promise<void> {
    const active: any[] = await Meeting.find({ status: { $in: ['confirmed', 'scheduled'] }, $or: [{ scheduledFor: { $exists: true } }, { scheduledAt: { $exists: true } }] });
    for (const meeting of active) {
      const scheduledFor = new Date(meeting.scheduledFor || meeting.scheduledAt);
      if (scheduledFor.getTime() + Number(meeting.durationMinutes || 30) * 60000 + MeetingAutomationPolicyService.reviewGraceMs() <= now.getTime()) {
        const reviewed: any = await Meeting.findOneAndUpdate({ _id: meeting._id, userId: meeting.userId, status: { $in: ['confirmed', 'scheduled'] } }, { $set: { status: 'pending_review', outcome: { type: 'pending_review', actor: 'unknown', reason: 'meeting_ended_without_reliable_attendance_evidence', recordedAt: now, recordedBy: 'durable_worker' } }, $push: { lifecycleHistory: { status: 'pending_review', at: now, reason: 'attendance_requires_human_review' } } }, { new: true });
        if (reviewed) await this.ensureAction(reviewed, 'outcome_review', now, 'pending_review');
        continue;
      }
      for (const window of MeetingAutomationPolicyService.reminderWindows()) {
        const dueAt = new Date(scheduledFor.getTime() - window * 60000);
        if (dueAt >= scheduledFor || scheduledFor.getTime() - now.getTime() < MeetingAutomationPolicyService.minLeadMinutes() * 60000) continue;
        await this.ensureAction(meeting, 'reminder', dueAt, `window_${window}`, window);
      }
    }
    const outcomes: any[] = await Meeting.find({ status: { $in: ['completed', 'cancelled', 'no_show', 'failed', 'pending_review'] } });
    for (const meeting of outcomes) {
      const outcome = meeting.status === 'completed' ? 'attended' : meeting.status === 'no_show' ? 'no_show' : meeting.status === 'cancelled' ? 'cancelled' : meeting.status === 'failed' ? 'technical_failure' : 'pending_review';
      await this.ensureAction(meeting, outcome === 'pending_review' ? 'outcome_review' : 'post_meeting', new Date(new Date(meeting.outcome?.recordedAt || meeting.failedAt || meeting.updatedAt).getTime() + MeetingAutomationPolicyService.followupDelayMs()), outcome);
    }
    await this.reconcile(now);
  }

  private static async ensureAction(meeting: any, kind: 'reminder' | 'post_meeting' | 'outcome_review', dueAt: Date, reason: string, windowMinutes?: number): Promise<void> {
    const scheduledFor = meeting.scheduledFor || meeting.scheduledAt;
    const key = `${meeting._id}:${kind}:${kind === 'reminder' ? `${new Date(scheduledFor).toISOString()}:${windowMinutes}` : `${meeting.status}:${meeting.outcome?.recordedAt?.toISOString?.() || meeting.updatedAt.toISOString()}`}`;
    await MeetingAction.findOneAndUpdate({ userId: meeting.userId, idempotencyKey: key }, { $setOnInsert: { userId: meeting.userId, leadId: meeting.leadId, conversationId: meeting.conversationId, meetingId: meeting._id, kind, idempotencyKey: key, dueAt, status: 'pending', scheduledForSnapshot: scheduledFor, meetingStatusSnapshot: meeting.status, channelSnapshot: meeting.originChannel, windowMinutes, outcome: meeting.outcome?.type, reason } }, { upsert: true });
  }

  static async reconcile(now = new Date()): Promise<void> {
    const actions: any[] = await MeetingAction.find({ kind: 'reminder', status: { $in: ['pending', 'processing', 'completed'] } });
    for (const action of actions) {
      const meeting: any = await Meeting.findOne({ _id: action.meetingId, userId: action.userId });
      const scheduledFor = meeting ? new Date(meeting.scheduledFor || meeting.scheduledAt || 0) : null;
      const obsolete = !meeting || (action.kind === 'reminder' && (!['confirmed', 'scheduled'].includes(meeting.status) || !scheduledFor || scheduledFor.getTime() !== new Date(action.scheduledForSnapshot || 0).getTime()));
      if (obsolete) await this.cancelAction(action, !meeting ? 'meeting_missing' : meeting.status === 'cancelled' ? 'meeting_cancelled' : 'meeting_rescheduled', now);
    }
    const terminal: any[] = await Meeting.find({ status: { $in: ['cancelled', 'completed', 'no_show', 'failed', 'pending_review'] } }).select('_id userId status');
    for (const meeting of terminal) await Task.updateMany({ userId: meeting.userId, 'metadata.meetingId': meeting._id.toString(), 'metadata.meetingActionKind': { $exists: false }, status: 'pending' }, { $set: { status: meeting.status === 'completed' ? 'completed' : 'cancelled', 'metadata.reconciledAt': now, 'metadata.reconciledReason': meeting.status } });
    const proposals: any[] = await AssistedProposal.find({ purpose: { $in: ['meeting_scheduling', 'meeting_reminder', 'meeting_followup'] }, status: { $in: ['proposed', 'failed'] } }).limit(200);
    for (const proposal of proposals) { const validation = await this.validateProposal(proposal, now); if (!validation.valid) await this.invalidateProposal(proposal._id, validation.reason || 'context_changed', now); }
  }

  private static async execute(action: any, now: Date): Promise<void> {
    const [meeting, lead, conversation]: any[] = await Promise.all([Meeting.findOne({ _id: action.meetingId, userId: action.userId }), Lead.findOne({ _id: action.leadId, userId: action.userId }), Conversation.findOne({ _id: action.conversationId, userId: action.userId })]);
    if (!meeting || !lead || !conversation) return this.cancelAction(action, 'context_missing', now);
    if (action.kind === 'reminder') {
      const scheduledFor = new Date(meeting.scheduledFor || meeting.scheduledAt || 0);
      if (!['confirmed', 'scheduled'].includes(meeting.status) || scheduledFor.getTime() !== new Date(action.scheduledForSnapshot).getTime() || now >= scheduledFor) return this.cancelAction(action, 'meeting_changed_or_started', now);
    }
    const safety = await MeetingAutomationPolicyService.eligible(lead, conversation);
    if (!safety.eligible) return this.cancelAction(action, safety.reason || 'not_eligible', now);
    const platform = String(meeting.originChannel || lead.currentChannel || lead.platform);
    const channelDecision = await MultichannelIdentityService.proposalDecision(lead.userId.toString(), lead._id, platform, `meeting_${action.kind}`);
    const task = action.kind === 'reminder'
      ? await Task.create({ userId: lead.userId, leadId: lead._id, conversationId: conversation._id, title: `Revisar recordatorio de reunión (${action.windowMinutes} min)`, description: `Reunión: ${MeetingAvailabilityService.format(new Date(meeting.scheduledFor || meeting.scheduledAt), meeting.timezone || MeetingAvailabilityService.config().timezone)}. Revisar antes de enviar.`, type: 'meeting', status: 'pending', priority: action.windowMinutes <= 60 ? 'high' : 'medium', dueDate: action.dueAt, metadata: { meetingId: meeting._id.toString(), meetingActionId: action._id.toString(), meetingActionKind: 'reminder', suggestedOnly: true } })
      : await TaskService.upsertPendingFollowUp(lead.userId.toString(), { leadId: lead._id, conversationId: conversation._id, title: action.kind === 'outcome_review' ? 'Revisar resultado de reunión' : 'Seguimiento posreunión', description: action.kind === 'outcome_review' ? 'La reunión terminó, pero no existe evidencia fiable de asistencia. Registra el resultado manualmente.' : `Resultado registrado: ${action.reason}. Revisa el siguiente paso antes de contactar.`, type: 'follow_up', status: 'pending', priority: 'high', dueDate: now, metadata: { followUpPurpose: action.kind === 'outcome_review' ? 'meeting_outcome_review' : 'post_meeting_followup', meetingId: meeting._id.toString(), meetingActionId: action._id.toString(), meetingActionKind: action.kind, suggestedOnly: true, outcome: action.reason, contactId: channelDecision.contactId, channelDecision: channelDecision.reason, origins: ['meeting_lifecycle'] } });
    const recipient = this.recipientFor(lead, platform);
    let proposal: any;
    if (channelDecision.allowed && recipient && action.kind !== 'outcome_review' && ['whatsapp', 'instagram', 'facebook'].includes(platform)) proposal = await this.createProposal(action, meeting, lead, conversation, platform as any, recipient, now);
    const trigger = action.kind === 'reminder' ? 'meeting.reminder_due' : 'meeting.followup_due';
    await AutomationEngineService.emit({ eventId: action.idempotencyKey, trigger: trigger as any, userId: lead.userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform: platform as any, data: { meetingId: meeting._id.toString(), status: meeting.status, outcome: action.reason, windowMinutes: action.windowMinutes } });
    await Activity.create({ userId: lead.userId, leadId: lead._id, conversationId: conversation._id, type: action.kind === 'reminder' ? 'task_created' : 'follow_up_scheduled', description: action.kind === 'reminder' ? 'Recordatorio de reunión preparado para revisión humana' : 'Siguiente paso posreunión preparado', metadata: { meetingId: meeting._id, actionId: action._id, taskId: task._id, proposalId: proposal?._id, autoSent: false } });
    await MeetingAction.updateOne({ _id: action._id, status: 'processing' }, { $set: { status: 'completed', completedAt: now, taskId: task._id, proposalId: proposal?._id }, $unset: { lockedAt: 1 } });
  }

  private static async createProposal(action: any, meeting: any, lead: any, conversation: any, platform: 'whatsapp' | 'instagram' | 'facebook', recipient: { type: string; externalId: string }, now: Date): Promise<any> {
    const history = (conversation.messages ?? []).slice(-10).filter((message: any) => ['lead', 'ai'].includes(message.sender)).map((message: any) => ({ sender: message.sender as 'lead' | 'ai', text: String(message.text).slice(0, 1000) }));
    const memory = await ConversationService.getOrInitializeAIMemory(conversation._id.toString(), lead.userId.toString());
    const commercial: any = await CommercialContextService.getActive(lead.userId.toString());
    const scheduled = meeting.scheduledFor || meeting.scheduledAt;
    const reason = action.kind === 'reminder' ? MeetingAvailabilityService.format(new Date(scheduled), meeting.timezone || MeetingAvailabilityService.config().timezone) : action.reason;
    const generated = await getAIProvider().generateReply({ incomingText: reason, isNewLead: false, intent: String(lead.qualification?.intent || 'interest'), normalizedIntent: String(lead.normalizedIntent || 'undetermined'), platform, history, askedTopics: memory.askedTopics, purpose: action.kind === 'reminder' ? 'meeting_reminder' : 'meeting_followup', reactivationReason: reason, commercialContext: commercial ? { brandName: commercial.brandName, businessType: commercial.businessType, commercialLines: commercial.commercialLines, allowedInformation: commercial.allowedInformation, informationPendingConfirmation: commercial.informationPendingConfirmation, communicationRules: commercial.communicationRules, restrictions: commercial.restrictions, disclaimers: commercial.disclaimers } : undefined });
    const safe = AlmaService.avoidRepeatedResponse(generated.text, history, memory, '').text.slice(0, 1000);
    const purpose = action.kind === 'reminder' ? 'meeting_reminder' : 'meeting_followup';
    await AssistedProposal.updateMany({ userId: lead.userId, leadId: lead._id, purpose, status: { $in: ['proposed', 'failed'] }, 'contextSnapshot.meetingId': meeting._id.toString() }, { $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: 'replaced_by_new_meeting_proposal', errorMessage: 'Propuesta de reunión reemplazada' } });
    return AssistedProposal.findOneAndUpdate({ userId: lead.userId, sourceEventId: action.idempotencyKey }, { $setOnInsert: { userId: lead.userId, leadId: lead._id, conversationId: conversation._id, sourceEventId: action.idempotencyKey, platform, recipient, text: safe, originalText: safe, purpose, status: 'proposed', expiresAt: new Date(Math.min(now.getTime() + MeetingAutomationPolicyService.proposalTtlMs(), action.kind === 'reminder' ? new Date(scheduled).getTime() : Infinity)), contextSnapshot: { leadStatus: lead.status, channel: platform, conversationLastMessageAt: conversation.lastMessage, meetingId: meeting._id.toString(), meetingStatus: meeting.status, meetingScheduledFor: scheduled } } }, { upsert: true, new: true });
  }

  static async validateProposal(proposal: any, now = new Date()): Promise<{ valid: boolean; reason?: string }> {
    if (!['meeting_scheduling', 'meeting_reminder', 'meeting_followup'].includes(proposal.purpose)) return { valid: true };
    const [meeting, lead, conversation]: any[] = await Promise.all([Meeting.findOne({ _id: proposal.contextSnapshot?.meetingId, userId: proposal.userId }).lean(), Lead.findOne({ _id: proposal.leadId?._id || proposal.leadId, userId: proposal.userId }).lean(), Conversation.findOne({ _id: proposal.conversationId, userId: proposal.userId }).lean()]);
    if (!meeting || !lead || !conversation) return { valid: false, reason: 'context_missing' };
    if (proposal.expiresAt && new Date(proposal.expiresAt) <= now) return { valid: false, reason: 'proposal_expired' };
    if (meeting.status !== proposal.contextSnapshot?.meetingStatus) return { valid: false, reason: 'meeting_status_changed' };
    if (proposal.purpose === 'meeting_scheduling' && !['requested', 'pending_confirmation', 'reschedule_requested', 'pending_details', 'pending_booking', 'pending_configuration'].includes(meeting.status)) return { valid: false, reason: 'scheduling_finished' };
    if (new Date(meeting.scheduledFor || meeting.scheduledAt || 0).getTime() !== new Date(proposal.contextSnapshot?.meetingScheduledFor || 0).getTime()) return { valid: false, reason: 'meeting_rescheduled' };
    const channel = String(meeting.originChannel || lead.currentChannel || lead.platform);
    if (channel !== proposal.contextSnapshot?.channel) return { valid: false, reason: 'channel_changed' };
    if (new Date(conversation.lastMessage || 0).getTime() !== new Date(proposal.contextSnapshot?.conversationLastMessageAt || 0).getTime()) return { valid: false, reason: 'conversation_changed' };
    const safety = await MeetingAutomationPolicyService.eligible(lead, conversation); return safety.eligible ? { valid: true } : { valid: false, reason: safety.reason };
  }

  static async invalidateProposal(id: any, reason: string, now = new Date()): Promise<void> { await AssistedProposal.updateOne({ _id: id, purpose: { $in: ['meeting_scheduling', 'meeting_reminder', 'meeting_followup'] }, status: { $in: ['proposed', 'failed'] } }, { $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: reason, errorMessage: `Propuesta de reunión caducada: ${reason}` } }); }
  private static async cancelAction(action: any, reason: string, now: Date): Promise<void> { await MeetingAction.updateOne({ _id: action._id, status: { $in: ['pending', 'processing', 'completed'] } }, { $set: { status: 'cancelled', completedAt: now, reason }, $unset: { lockedAt: 1 } }); if (action.proposalId) await this.invalidateProposal(action.proposalId, reason, now); if (action.taskId) await Task.updateOne({ _id: action.taskId, status: 'pending' }, { $set: { status: 'cancelled', 'metadata.cancelReason': reason } }); }
  private static recipientFor(lead: any, platform: string): { type: string; externalId: string } | undefined { if (platform === 'whatsapp' && lead.phone) return { type: 'whatsapp_user', externalId: lead.phone }; if (platform === 'instagram' && lead.username) return { type: 'instagram_user', externalId: lead.username }; if (platform === 'facebook' && lead.username) return { type: 'facebook_user', externalId: lead.username }; return undefined; }
}
