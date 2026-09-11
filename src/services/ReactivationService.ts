import crypto from 'crypto';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import Meeting from '../models/Meeting';
import AssistedProposal from '../models/AssistedProposal';
import QualificationHistory from '../models/QualificationHistory';
import Task from '../models/Task';
import Activity from '../models/Activity';
import { FollowUpPolicyService } from './FollowUpService';
import { TaskService } from './TaskService';
import { ConversationService } from './ConversationService';
import { CommercialContextService } from './CommercialContextService';
import { getAIProvider } from '../integrations/ai';
import { AlmaService } from './AlmaService';
import { MultichannelIdentityService } from './MultichannelIdentityService';

type Decision = { eligible: boolean; reason: string; nextEligibleAt?: Date; terminal?: boolean };

export class ReactivationPolicyService {
  static inactivityMs(): number { return Math.max(86400000, Number(process.env.REACTIVATION_INACTIVITY_MS || 14 * 86400000)); }
  static cooldownMs(): number { return Math.max(86400000, Number(process.env.REACTIVATION_COOLDOWN_MS || 30 * 86400000)); }
  static proposalTtlMs(): number { return Math.max(3600000, Number(process.env.REACTIVATION_PROPOSAL_TTL_MS || 7 * 86400000)); }
  static maxAttempts(): number { return Math.max(1, Number(process.env.REACTIVATION_MAX_ATTEMPTS || 2)); }

  static activityAt(lead: any, conversation: any): Date {
    const lastMessage = (conversation.messages ?? [])[conversation.messages?.length - 1];
    const candidates = [lead.lastContact, conversation.lastMessage, lastMessage?.timestamp]
      .map(value => value ? new Date(value).getTime() : 0);
    return new Date(Math.max(...candidates, 0));
  }

  static async evaluate(lead: any, conversation: any, now: Date, ignoredProposalId?: string): Promise<Decision> {
    if (FollowUpPolicyService.isOptOut(lead, conversation)) return { eligible: false, reason: 'opt_out_or_rejected', terminal: true };
    if (['registered', 'rejected'].includes(lead.status)) return { eligible: false, reason: 'lead_terminal_state', terminal: true };
    if (conversation.status === 'closed') return { eligible: false, reason: 'conversation_closed', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    if (conversation.controlMode === 'handoff_requested') return { eligible: false, reason: 'handoff_requested', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    if (conversation.controlMode === 'human_controlled') return { eligible: false, reason: 'human_controlled', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    if (!ignoredProposalId && Number(lead.reactivation?.attempts || 0) >= this.maxAttempts()) return { eligible: false, reason: 'max_attempts_reached', terminal: true };
    const activityAt = this.activityAt(lead, conversation);
    const inactivityDueAt = new Date(activityAt.getTime() + this.inactivityMs());
    if (inactivityDueAt > now) return { eligible: false, reason: 'recent_activity', nextEligibleAt: inactivityDueAt };
    const nextEligible = lead.reactivation?.nextEligibleAt ? new Date(lead.reactivation.nextEligibleAt) : null;
    if (!ignoredProposalId && nextEligible && nextEligible > now) return { eligible: false, reason: 'cooldown_active', nextEligibleAt: nextEligible };
    const last = (conversation.messages ?? [])[conversation.messages?.length - 1];
    if (!last || last.sender === 'lead') return { eligible: false, reason: 'awaiting_business_response', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    const activeMeeting = await Meeting.exists({ userId: lead.userId, leadId: lead._id, status: { $in: ['requested', 'pending_confirmation', 'confirmed', 'scheduled', 'pending_booking', 'pending_configuration', 'reschedule_requested'] }, $or: [{ scheduledAt: { $gt: now } }, { scheduledFor: { $gt: now } }, { status: { $in: ['requested', 'pending_confirmation', 'pending_booking', 'pending_configuration', 'reschedule_requested'] } }] });
    if (activeMeeting) return { eligible: false, reason: 'active_meeting', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    const proposalQuery: any = { userId: lead.userId, leadId: lead._id, conversationId: conversation._id, status: { $in: ['proposed', 'sending', 'failed'] } };
    if (ignoredProposalId) proposalQuery._id = { $ne: ignoredProposalId };
    if (await AssistedProposal.exists(proposalQuery)) return { eligible: false, reason: 'pending_assisted_proposal', nextEligibleAt: new Date(now.getTime() + this.cooldownMs()) };
    return { eligible: true, reason: `inactive_since_${activityAt.toISOString()}` };
  }
}

export class ReactivationService {
  static async processInactiveLeads(limit = 20, now = new Date()): Promise<number> {
    await this.reconcileOpenProposals(now);
    const cutoff = new Date(now.getTime() - ReactivationPolicyService.inactivityMs());
    const conversations: any[] = await Conversation.find({ lastMessage: { $lte: cutoff } })
      .sort({ lastMessage: 1 }).limit(Math.max(limit * 5, limit)).lean();
    let processed = 0;
    for (const conversation of conversations) {
      if (processed >= limit) break;
      const token = crypto.randomUUID();
      const stale = new Date(now.getTime() - 5 * 60000);
      const lead: any = await Lead.findOneAndUpdate({ _id: conversation.leadId, userId: conversation.userId,
        $and: [
          { $or: [{ 'reactivation.disabledAt': { $exists: false } }, { 'reactivation.disabledAt': null }] },
          { $or: [{ 'reactivation.attempts': { $exists: false } }, { 'reactivation.attempts': { $lt: ReactivationPolicyService.maxAttempts() } }] },
          { $or: [{ 'reactivation.nextEligibleAt': { $exists: false } }, { 'reactivation.nextEligibleAt': null }, { 'reactivation.nextEligibleAt': { $lte: now } }] },
          { $or: [{ 'reactivation.claimedAt': { $exists: false } }, { 'reactivation.claimedAt': null }, { 'reactivation.claimedAt': { $lte: stale } }] },
        ] }, { $set: { 'reactivation.claimToken': token, 'reactivation.claimedAt': now } }, { new: true });
      if (!lead) continue;
      await this.processClaimed(lead, conversation, token, now);
      processed++;
    }
    return processed;
  }

  static async reconcileOpenProposals(now = new Date(), limit = 100): Promise<number> {
    const proposals: any[] = await AssistedProposal.find({ purpose: 'reactivation', status: { $in: ['proposed', 'failed'] } }).sort({ createdAt: 1 }).limit(limit);
    let invalidated = 0;
    for (const proposal of proposals) {
      const validation = await this.validateProposal(proposal, now);
      if (!validation.valid) { await this.invalidateProposal(proposal._id, validation.reason || 'context_changed', now); invalidated++; }
    }
    return invalidated;
  }

  private static async processClaimed(lead: any, staleConversation: any, token: string, now: Date): Promise<void> {
    const conversation: any = await Conversation.findOne({ _id: staleConversation._id, userId: lead.userId });
    if (!conversation) return this.finish(lead, token, 'excluded', 'conversation_missing', undefined, now);
    const decision = await ReactivationPolicyService.evaluate(lead, conversation, now);
    if (!decision.eligible) return this.finish(lead, token, ['recent_activity', 'cooldown_active', 'pending_assisted_proposal'].includes(decision.reason) ? 'deferred' : 'excluded', decision.reason, decision.nextEligibleAt, now, decision.terminal);
    const platform = String(lead.currentChannel || (conversation.messages ?? []).at(-1)?.platform || lead.platform);
    const activityAt = ReactivationPolicyService.activityAt(lead, conversation);
    const eventId = `reactivation:${lead._id}:${activityAt.toISOString()}`;
    const recipient = this.recipientFor(lead, platform);
    const channelDecision = await MultichannelIdentityService.proposalDecision(lead.userId.toString(), lead._id, platform, 'reactivation');
    const qualification: any = await QualificationHistory.findOne({ userId: lead.userId, leadId: lead._id, processingState: 'completed' }).sort({ evaluatedAt: -1 }).lean();
    const contextReason = this.contextReason(lead, qualification);
    const task = await TaskService.upsertPendingFollowUp(lead.userId.toString(), { leadId: lead._id, conversationId: conversation._id,
      title: 'Reactivación pendiente de revisión', description: `Conversación inactiva por ${platform}. ${contextReason} Revisa, edita o descarta la propuesta antes de contactar.`,
      type: 'follow_up', status: 'pending', priority: lead.interestLevel === 'hot' || lead.score >= 80 ? 'high' : 'medium', dueDate: now,
      metadata: { suggestedOnly: true, followUpPurpose: 'lead_reactivation', reason: decision.reason, contextReason, platform, sourceEventId: eventId, contactId: channelDecision.contactId, channelDecision: channelDecision.reason, origins: ['durable_reactivation'] } });
    let proposal: any;
    if (channelDecision.allowed && recipient && ['whatsapp', 'instagram', 'facebook'].includes(platform)) proposal = await this.createProposal(lead, conversation, qualification, eventId, platform as any, recipient, decision.reason, now);
    if (proposal) await Task.updateOne({ _id: task._id }, { $set: { 'metadata.proposalId': proposal._id } });
    await Lead.updateOne({ _id: lead._id, userId: lead.userId, 'reactivation.claimToken': token }, { $set: {
      'reactivation.lastAttemptAt': now, 'reactivation.nextEligibleAt': new Date(now.getTime() + ReactivationPolicyService.cooldownMs()),
      'reactivation.lastDecisionAt': now, 'reactivation.lastDecision': proposal ? 'proposed' : 'task_only', 'reactivation.lastReason': decision.reason,
    }, $inc: { 'reactivation.attempts': 1 }, $unset: { 'reactivation.claimToken': 1, 'reactivation.claimedAt': 1 } });
    await Activity.create({ userId: lead.userId, leadId: lead._id, conversationId: conversation._id, type: 'follow_up_scheduled', description: 'Reactivación asistida preparada para revisión humana', metadata: { eventId, taskId: task._id, proposalId: proposal?._id, platform, autoSent: false, contextReason } });
  }

  private static contextReason(lead: any, qualification: any): string {
    const intent = lead.normalizedIntent || lead.qualification?.normalizedIntent || qualification?.current?.normalizedIntent;
    const label: Record<string, string> = { additional_income_interest: 'Interés previo en ingresos adicionales.', product_interest: 'Interés previo en productos.', product_sales_interest: 'Interés previo en comercializar productos.', business_opportunity: 'Interés previo en la oportunidad de negocio.', business_and_product_interest: 'Interés previo tanto en productos como en negocio.' };
    return label[intent] || `Calificación previa ${lead.interestLevel || 'cold'} con score ${Number(lead.score || 0)}.`;
  }

  private static recipientFor(lead: any, platform: string): { type: string; externalId: string } | undefined {
    if (platform === 'whatsapp' && lead.phone) return { type: 'whatsapp_user', externalId: lead.phone };
    if (platform === 'instagram' && lead.username) return { type: 'instagram_user', externalId: lead.username };
    if (platform === 'facebook' && lead.username) return { type: 'facebook_user', externalId: lead.username };
    return undefined;
  }

  private static async createProposal(lead: any, conversation: any, qualification: any, eventId: string, platform: 'whatsapp' | 'instagram' | 'facebook', recipient: { type: string; externalId: string }, reason: string, now: Date): Promise<any> {
    const history = (conversation.messages ?? []).slice(-12).filter((message: any) => ['lead', 'ai'].includes(message.sender)).map((message: any) => ({ sender: message.sender as 'lead' | 'ai', text: String(message.text).slice(0, 1000) }));
    const memory = await ConversationService.getOrInitializeAIMemory(conversation._id.toString(), lead.userId.toString());
    const commercialContext: any = await CommercialContextService.getActive(lead.userId.toString());
    const generated = await getAIProvider().generateReply({ incomingText: this.contextReason(lead, qualification), isNewLead: false, intent: String(lead.qualification?.intent || 'interest'), normalizedIntent: String(lead.normalizedIntent || lead.qualification?.normalizedIntent || 'undetermined'), platform, history, askedTopics: memory.askedTopics, purpose: 'reactivation', reactivationReason: reason,
      commercialContext: commercialContext ? { brandName: commercialContext.brandName, businessType: commercialContext.businessType, commercialLines: commercialContext.commercialLines, allowedInformation: commercialContext.allowedInformation, informationPendingConfirmation: commercialContext.informationPendingConfirmation, communicationRules: commercialContext.communicationRules, restrictions: commercialContext.restrictions, disclaimers: commercialContext.disclaimers } : undefined });
    const lastLeadText = [...history].reverse().find(message => message.sender === 'lead')?.text || '';
    const safe = AlmaService.avoidRepeatedResponse(generated.text, history, memory, lastLeadText).text.slice(0, 1000);
    const lastLead = [...(conversation.messages ?? [])].reverse().find((message: any) => message.sender === 'lead');
    await AssistedProposal.updateMany({ userId: lead.userId, leadId: lead._id, purpose: 'reactivation', status: { $in: ['proposed', 'failed'] } }, { $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: 'replaced_by_new_proposal', errorMessage: 'Propuesta reemplazada por una reactivación más reciente' } });
    const proposal = await AssistedProposal.findOneAndUpdate({ userId: lead.userId, sourceEventId: eventId }, { $setOnInsert: { userId: lead.userId, leadId: lead._id, conversationId: conversation._id, sourceEventId: eventId, platform, recipient, text: safe, originalText: safe, purpose: 'reactivation', status: 'proposed', expiresAt: new Date(now.getTime() + ReactivationPolicyService.proposalTtlMs()), contextSnapshot: { leadStatus: lead.status, channel: platform, conversationLastMessageAt: conversation.lastMessage, lastLeadMessageId: lastLead?._id?.toString(), qualificationEvaluatedAt: lead.qualification?.lastEvaluatedAt } } }, { upsert: true, new: true });
    await Conversation.updateOne({ _id: conversation._id, userId: lead.userId }, { $set: { 'aiAnalysis.recommendedResponse': safe } });
    return proposal;
  }

  static async validateProposal(proposal: any, now = new Date()): Promise<{ valid: boolean; reason?: string }> {
    if (proposal.purpose !== 'reactivation') return { valid: true };
    const [lead, conversation] = await Promise.all([
      Lead.findOne({ _id: proposal.leadId?._id || proposal.leadId, userId: proposal.userId }).lean(),
      Conversation.findOne({ _id: proposal.conversationId, userId: proposal.userId }).lean(),
    ]);
    if (!lead || !conversation) return { valid: false, reason: 'context_missing' };
    if (proposal.expiresAt && new Date(proposal.expiresAt) <= now) return { valid: false, reason: 'proposal_expired' };
    if (lead.status !== proposal.contextSnapshot?.leadStatus) return { valid: false, reason: 'lead_status_changed' };
    const channel = String(lead.currentChannel || (conversation.messages ?? []).at(-1)?.platform || lead.platform);
    if (channel !== proposal.contextSnapshot?.channel) return { valid: false, reason: 'channel_changed' };
    if (new Date(conversation.lastMessage || 0).getTime() !== new Date(proposal.contextSnapshot?.conversationLastMessageAt || 0).getTime()) return { valid: false, reason: 'conversation_changed' };
    const lastLead = [...(conversation.messages ?? [])].reverse().find((message: any) => message.sender === 'lead');
    if (String(lastLead?._id || '') !== String(proposal.contextSnapshot?.lastLeadMessageId || '')) return { valid: false, reason: 'prospect_replied' };
    const decision = await ReactivationPolicyService.evaluate(lead, conversation, now, proposal._id.toString());
    return decision.eligible ? { valid: true } : { valid: false, reason: decision.reason };
  }

  static async invalidateProposal(proposalId: any, reason: string, now = new Date()): Promise<void> {
    await AssistedProposal.updateOne({ _id: proposalId, purpose: 'reactivation', status: { $in: ['proposed', 'failed'] } }, { $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: reason, errorMessage: `Reactivación caducada: ${reason}` } });
    await Task.updateMany({ 'metadata.proposalId': proposalId, status: 'pending' }, { $set: { status: 'cancelled', 'metadata.cancelReason': reason, 'metadata.cancelledAt': now } });
  }

  private static async finish(lead: any, token: string, decision: string, reason: string, nextEligibleAt: Date | undefined, now: Date, terminal = false): Promise<void> {
    await Lead.updateOne({ _id: lead._id, userId: lead.userId, 'reactivation.claimToken': token }, { $set: { 'reactivation.nextEligibleAt': nextEligibleAt ?? null, 'reactivation.lastDecisionAt': now, 'reactivation.lastDecision': decision, 'reactivation.lastReason': reason, ...(terminal ? { 'reactivation.disabledAt': now } : {}) }, $unset: { 'reactivation.claimToken': 1, 'reactivation.claimedAt': 1 } });
  }
}
