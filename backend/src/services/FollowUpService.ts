import crypto from 'crypto';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import Meeting from '../models/Meeting';
import Task from '../models/Task';
import AssistedProposal from '../models/AssistedProposal';
import { TaskService } from './TaskService';
import { AutomationEngineService } from './AutomationEngineService';
import { CommercialContextService } from './CommercialContextService';
import { getAIProvider } from '../integrations/ai';
import { AlmaService } from './AlmaService';
import { MultichannelIdentityService } from './MultichannelIdentityService';

type Decision = { eligible: boolean; reason: string; cancelTasks?: boolean; deferUntil?: Date };

export class FollowUpPolicyService {
  static maxAttempts(): number { return Math.max(1, Number(process.env.FOLLOWUP_MAX_ATTEMPTS || 3)); }
  static cooldownMs(): number { return Math.max(60000, Number(process.env.FOLLOWUP_COOLDOWN_MS || 86400000)); }

  static isOptOut(lead: any, conversation: any): boolean {
    if (lead.status === 'rejected' || lead.normalizedIntent === 'rejection' || lead.qualification?.intent === 'rejection') return true;
    if ((lead.tags ?? []).some((tag: string) => ['opt_out', 'no_contactar', 'no_continuar'].includes(tag))) return true;
    const text = (conversation.messages ?? []).filter((message: any) => message.sender === 'lead').slice(-3).map((message: any) => message.text).join(' ');
    return /no me interesa|no (?:quiero|deseo) continuar|deja de escribir|no me contactes|\bstop\b/i.test(text);
  }

  static async evaluate(lead: any, conversation: any, scheduledAt: Date, now: Date): Promise<Decision> {
    if (this.isOptOut(lead, conversation)) return { eligible: false, reason: 'opt_out_or_rejected', cancelTasks: true };
    if (lead.status === 'registered') return { eligible: false, reason: 'lead_terminal_state', cancelTasks: true };
    if (conversation.status === 'closed') return { eligible: false, reason: 'conversation_closed', cancelTasks: true };
    if (conversation.controlMode === 'handoff_requested') return { eligible: false, reason: 'handoff_requested', cancelTasks: true };
    if (conversation.controlMode === 'human_controlled') return { eligible: false, reason: 'human_controlled', cancelTasks: true };
    if (Number(lead.followUp?.attempts || 0) >= this.maxAttempts()) return { eligible: false, reason: 'max_attempts_reached', cancelTasks: true };
    const nextEligibleAt = lead.followUp?.nextEligibleAt ? new Date(lead.followUp.nextEligibleAt) : null;
    if (nextEligibleAt && nextEligibleAt > now) return { eligible: false, reason: 'cooldown_active', deferUntil: nextEligibleAt };
    const activeMeeting = await Meeting.exists({ userId: lead.userId, leadId: lead._id, status: { $in: ['confirmed', 'scheduled', 'pending_configuration'] }, $or: [{ scheduledAt: { $gt: now } }, { scheduledFor: { $gt: now } }, { status: 'pending_configuration' }] });
    if (activeMeeting) return { eligible: false, reason: 'active_meeting', cancelTasks: true };
    const messages = conversation.messages ?? [];
    const newerLeadMessage = messages.some((message: any) => message.sender === 'lead' && new Date(message.timestamp) > scheduledAt);
    if (newerLeadMessage) return { eligible: false, reason: 'prospect_replied_after_schedule', cancelTasks: true };
    const last = messages[messages.length - 1];
    if (!last || last.sender === 'lead') return { eligible: false, reason: 'awaiting_initial_human_response', cancelTasks: false };
    const pendingProposal = await AssistedProposal.exists({ userId: lead.userId, leadId: lead._id, conversationId: conversation._id, status: { $in: ['proposed', 'sending', 'failed'] } });
    if (pendingProposal) return { eligible: false, reason: 'pending_assisted_proposal', cancelTasks: false };
    return { eligible: true, reason: 'due_without_prospect_reply' };
  }
}

export class FollowUpService {
  static async processDueFollowUps(limit = 20, now = new Date()): Promise<number> {
    let processed = 0;
    while (processed < limit) {
      const token = crypto.randomUUID();
      const stale = new Date(now.getTime() - 5 * 60000);
      const lead: any = await Lead.findOneAndUpdate({ nextFollowUp: { $lte: now }, $or: [{ 'followUp.claimedAt': { $exists: false } }, { 'followUp.claimedAt': null }, { 'followUp.claimedAt': { $lte: stale } }] }, { $set: { 'followUp.claimToken': token, 'followUp.claimedAt': now } }, { new: true, sort: { nextFollowUp: 1 } });
      if (!lead) break;
      await this.processClaimed(lead, token, now);
      processed++;
    }
    return processed;
  }

  private static async processClaimed(lead: any, token: string, now: Date): Promise<void> {
    const dueAt = new Date(lead.nextFollowUp);
    const scheduledAt = lead.followUp?.scheduledAt ? new Date(lead.followUp.scheduledAt) : new Date(lead.lastContact || lead.updatedAt || dueAt);
    const conversation: any = await Conversation.findOne({ userId: lead.userId, leadId: lead._id }).sort({ lastMessage: -1 });
    if (!conversation) return this.finish(lead, token, 'cancelled', 'conversation_missing', null, true, now);
    const decision = await FollowUpPolicyService.evaluate(lead, conversation, scheduledAt, now);
    if (!decision.eligible) return this.finish(lead, token, decision.deferUntil ? 'deferred' : 'cancelled', decision.reason, decision.deferUntil ?? null, Boolean(decision.cancelTasks), now);

    const eventId = `followup:${lead._id}:${dueAt.toISOString()}`;
    const platform = String(lead.currentChannel || lead.platform);
    const recipient = this.recipientFor(lead, platform);
    const channelDecision = await MultichannelIdentityService.proposalDecision(lead.userId.toString(), lead._id, platform, 'follow_up');
    await AutomationEngineService.emit({ eventId, trigger: 'followup.due', userId: lead.userId.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), platform: platform as any, source: 'durable_followup_worker', occurredAt: now.toISOString(), recipient, data: { score: lead.score, interestLevel: lead.interestLevel, status: lead.status, intent: lead.qualification?.intent, normalizedIntent: lead.normalizedIntent, meetingIntent: lead.qualification?.meetingIntent, lastInteractionAt: lead.lastContact, followUpAttempts: Number(lead.followUp?.attempts || 0) } });
    const task = await TaskService.upsertPendingFollowUp(lead.userId.toString(), { leadId: lead._id, conversationId: conversation._id, title: 'Seguimiento pendiente de revisión', description: channelDecision.allowed ? `El prospecto no respondió y el seguimiento venció por ${platform}. Revisa la propuesta antes de contactar.` : `Seguimiento vencido, pero requiere revisión multicanal: ${channelDecision.reason}.`, type: 'follow_up', status: 'pending', priority: lead.interestLevel === 'hot' || lead.score >= 80 ? 'high' : 'medium', dueDate: now, metadata: { suggestedOnly: true, followUpPurpose: 'general_follow_up', reason: decision.reason, platform, sourceEventId: eventId, contactId: channelDecision.contactId, channelDecision: channelDecision.reason, origins: ['durable_followup'] } });
    if (channelDecision.allowed && recipient && ['whatsapp', 'instagram', 'facebook'].includes(platform)) await this.createProposal(lead, conversation, eventId, platform as 'whatsapp' | 'instagram' | 'facebook', recipient);
    await Lead.updateOne({ _id: lead._id, userId: lead.userId, 'followUp.claimToken': token }, { $set: { nextFollowUp: null, 'followUp.lastFollowUpAt': now, 'followUp.nextEligibleAt': new Date(now.getTime() + FollowUpPolicyService.cooldownMs()), 'followUp.lastDecisionAt': now, 'followUp.lastDecision': 'proposed', 'followUp.lastReason': decision.reason }, $inc: { 'followUp.attempts': 1 }, $unset: { 'followUp.claimToken': 1, 'followUp.claimedAt': 1 } });
    await Task.updateOne({ _id: task._id }, { $set: { 'metadata.followUpEventId': eventId } });
  }

  private static recipientFor(lead: any, platform: string): { type: string; externalId: string } | undefined {
    if (platform === 'whatsapp' && lead.phone) return { type: 'whatsapp_user', externalId: lead.phone };
    if (platform === 'instagram' && lead.username) return { type: 'instagram_user', externalId: lead.username };
    if (platform === 'facebook' && lead.username) return { type: 'facebook_user', externalId: lead.username };
    if (platform === 'youtube' && lead.username) return { type: 'youtube_comment', externalId: lead.username };
    return undefined;
  }

  private static async createProposal(lead: any, conversation: any, eventId: string, platform: 'whatsapp' | 'instagram' | 'facebook', recipient: { type: string; externalId: string }): Promise<void> {
    if (await AssistedProposal.exists({ userId: lead.userId, leadId: lead._id, conversationId: conversation._id, status: { $in: ['proposed', 'sending', 'failed'] } })) return;
    const history = (conversation.messages ?? []).slice(-10).filter((message: any) => ['lead', 'ai'].includes(message.sender)).map((message: any) => ({ sender: message.sender as 'lead' | 'ai', text: String(message.text).slice(0, 1000) }));
    const lastLeadText = [...history].reverse().find(message => message.sender === 'lead')?.text || 'Conversación pendiente de seguimiento';
    const commercialContext: any = await CommercialContextService.getActive(lead.userId.toString());
    const generated = await getAIProvider().generateReply({ incomingText: `Seguimiento contextual pendiente: ${lastLeadText}`, isNewLead: false, intent: String(lead.qualification?.intent || 'interest'), normalizedIntent: String(lead.normalizedIntent || 'undetermined'), platform, history, askedTopics: conversation.aiAskedTopics ?? [], commercialContext: commercialContext ? { brandName: commercialContext.brandName, businessType: commercialContext.businessType, commercialLines: commercialContext.commercialLines, allowedInformation: commercialContext.allowedInformation, informationPendingConfirmation: commercialContext.informationPendingConfirmation, communicationRules: commercialContext.communicationRules, restrictions: commercialContext.restrictions, disclaimers: commercialContext.disclaimers } : undefined });
    const safe = AlmaService.avoidRepeatedResponse(generated.text, history, { askedTopics: conversation.aiAskedTopics ?? [], responseFingerprints: conversation.aiResponseFingerprints ?? [] }, lastLeadText).text.slice(0, 1000);
    await AssistedProposal.findOneAndUpdate({ userId: lead.userId, sourceEventId: eventId }, { $setOnInsert: { userId: lead.userId, leadId: lead._id, conversationId: conversation._id, sourceEventId: eventId, platform, recipient, text: safe, originalText: safe, status: 'proposed' } }, { upsert: true, new: true });
    await Conversation.updateOne({ _id: conversation._id, userId: lead.userId }, { $set: { 'aiAnalysis.recommendedResponse': safe } });
  }

  private static async finish(lead: any, token: string, decision: string, reason: string, nextFollowUp: Date | null, cancelTasks: boolean, now: Date): Promise<void> {
    if (cancelTasks) await Promise.all([
      Task.updateMany({ userId: lead.userId, leadId: lead._id, type: 'follow_up', status: 'pending' }, { $set: { status: 'cancelled', 'metadata.cancelReason': reason, 'metadata.cancelledAt': now } }),
      AssistedProposal.updateMany({ userId: lead.userId, leadId: lead._id, status: { $in: ['proposed', 'failed'] }, sourceEventId: /^followup:/ }, { $set: { status: 'cancelled', errorMessage: `Seguimiento cancelado: ${reason}` } }),
    ]);
    await Lead.updateOne({ _id: lead._id, userId: lead.userId, 'followUp.claimToken': token }, { $set: { nextFollowUp, 'followUp.lastDecisionAt': now, 'followUp.lastDecision': decision, 'followUp.lastReason': reason }, $unset: { 'followUp.claimToken': 1, 'followUp.claimedAt': 1 } });
  }
}
