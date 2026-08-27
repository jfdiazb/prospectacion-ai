import crypto from 'crypto';
import ContactProfile from '../models/ContactProfile';
import ContactIdentity from '../models/ContactIdentity';
import DuplicateCandidate from '../models/DuplicateCandidate';
import IdentityAudit from '../models/IdentityAudit';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import Meeting from '../models/Meeting';
import AssistedProposal from '../models/AssistedProposal';
import Task from '../models/Task';
import mongoose from 'mongoose';

type Channel = 'whatsapp' | 'instagram' | 'facebook' | 'youtube' | 'telegram' | 'manual';

export class MultichannelIdentityService {
  static externalIdentity(lead: any): { platform: Channel; externalId: string } {
    const platform = String(lead.currentChannel || lead.platform) as Channel;
    const externalId = platform === 'whatsapp' ? String(lead.phone || '') : String(lead.username || '');
    if (!externalId) throw new Error('El lead no conserva un identificador externo seguro');
    return { platform, externalId };
  }

  static async contactForLead(userId: string, leadId: any): Promise<{ contact: any; identities: any[] } | null> {
    const identity: any = await ContactIdentity.findOne({ userId, leadId, status: 'active' }).lean();
    if (!identity) return null;
    const [contact, identities]: any[] = await Promise.all([ContactProfile.findOne({ _id: identity.contactId, userId }).lean(), ContactIdentity.find({ userId, contactId: identity.contactId, status: 'active' }).lean()]);
    return contact ? { contact, identities } : null;
  }

  static async linkLeads(userId: string, leadIds: string[], actor: string, source: string, reason?: string): Promise<any> {
    const unique = [...new Set(leadIds)].slice(0, 10); if (unique.length < 2) throw new Error('Se requieren al menos dos leads explícitos');
    const leads: any[] = await Lead.find({ _id: { $in: unique }, userId }); if (leads.length !== unique.length) throw new Error('Uno o más leads no pertenecen al propietario');
    const existing: any[] = await ContactIdentity.find({ userId, leadId: { $in: unique }, status: 'active' });
    const contacts = [...new Set(existing.map(item => item.contactId.toString()))];
    if (contacts.length > 1) throw new Error('Los leads pertenecen a contactos confirmados distintos; desvincula explícitamente antes de asociarlos');
    const deterministicId = new mongoose.Types.ObjectId(crypto.createHash('sha256').update(`${userId}:${unique.sort().join(':')}`).digest('hex').slice(0, 24));
    const contact: any = contacts.length ? await ContactProfile.findOne({ _id: contacts[0], userId }) : await ContactProfile.findOneAndUpdate({ _id: deterministicId, userId }, { $setOnInsert: { userId, createdBy: actor } }, { upsert: true, new: true });
    for (const lead of leads) {
      if (existing.some(item => item.leadId.toString() === lead._id.toString())) continue;
      const external = this.externalIdentity(lead);
      try { await ContactIdentity.create({ userId, contactId: contact._id, leadId: lead._id, ...external, confirmationSource: source.slice(0, 120), confirmedBy: actor }); }
      catch (error: any) { if (error?.code !== 11000) throw error; const duplicate: any = await ContactIdentity.findOne({ userId, leadId: lead._id, status: 'active' }); if (!duplicate || duplicate.contactId.toString() !== contact._id.toString()) throw new Error('La identidad ya está vinculada a otro contacto'); }
      await IdentityAudit.create({ userId, contactId: contact._id, leadId: lead._id, action: 'link_created', actor, source, reason, metadata: { platform: external.platform } });
    }
    await DuplicateCandidate.updateMany({ userId, status: 'pending', leadAId: { $in: unique }, leadBId: { $in: unique } }, { $set: { status: 'confirmed', resolvedAt: new Date(), resolvedBy: actor, resolutionReason: reason || 'explicit_link_confirmation' } });
    return this.getContact(userId, contact._id.toString());
  }

  static async unlink(userId: string, identityId: string, actor: string, reason?: string): Promise<any> {
    const identity: any = await ContactIdentity.findOneAndUpdate({ _id: identityId, userId, status: 'active' }, { $set: { status: 'unlinked', unlinkedAt: new Date(), unlinkedBy: actor } }, { new: true });
    if (!identity) return null;
    await IdentityAudit.create({ userId, contactId: identity.contactId, leadId: identity.leadId, action: 'link_removed', actor, reason });
    return identity;
  }

  static async getContact(userId: string, contactId: string): Promise<any> { const contact: any = await ContactProfile.findOne({ _id: contactId, userId }).lean(); if (!contact) return null; const identities = await ContactIdentity.find({ userId, contactId, status: 'active' }).populate('leadId').lean(); return { ...contact, identities }; }
  static async list(userId: string): Promise<any[]> { const contacts: any[] = await ContactProfile.find({ userId }).sort({ updatedAt: -1 }).lean(); const identities: any[] = await ContactIdentity.find({ userId, contactId: { $in: contacts.map(item => item._id) }, status: 'active' }).populate('leadId').lean(); return contacts.map(contact => ({ ...contact, identities: identities.filter(identity => identity.contactId.toString() === contact._id.toString()) })); }

  static async setPreferredChannel(userId: string, contactId: string, channel: Channel | null, actor: string): Promise<any> {
    if (channel) { const valid = await ContactIdentity.exists({ userId, contactId, platform: channel, status: 'active', consentStatus: { $nin: ['opted_out', 'blocked'] } }); if (!valid) throw new Error('El canal preferido debe ser una identidad activa y permitida'); }
    const contact: any = await ContactProfile.findOneAndUpdate({ _id: contactId, userId }, channel ? { $set: { preferredChannel: channel } } : { $unset: { preferredChannel: 1 } }, { new: true }); if (!contact) return null;
    await IdentityAudit.create({ userId, contactId, action: 'preferred_channel_changed', actor, metadata: { preferredChannel: channel } });
    await this.invalidateContactProposals(userId, contactId, 'preferred_channel_changed', actor);
    return this.getContact(userId, contactId);
  }

  static async setChannelConsent(userId: string, identityId: string, consentStatus: 'unknown' | 'consented' | 'opted_out' | 'blocked', actor: string, reason?: string): Promise<any> {
    const identity: any = await ContactIdentity.findOneAndUpdate({ _id: identityId, userId, status: 'active' }, { $set: { consentStatus, consentReason: reason?.slice(0, 500), consentUpdatedAt: new Date() } }, { new: true }); if (!identity) return null;
    await IdentityAudit.create({ userId, contactId: identity.contactId, leadId: identity.leadId, action: 'channel_consent_changed', actor, reason, metadata: { platform: identity.platform, consentStatus } });
    if (['opted_out', 'blocked'].includes(consentStatus)) await this.invalidateContactProposals(userId, identity.contactId.toString(), `channel_${consentStatus}`, actor);
    return identity;
  }

  static async setGeneralOptOut(userId: string, contactId: string, optedOut: boolean, actor: string, reason?: string): Promise<any> {
    const update = optedOut ? { $set: { generalOptOut: true, generalOptOutReason: reason?.slice(0, 500), generalOptOutAt: new Date() } } : { $set: { generalOptOut: false }, $unset: { generalOptOutReason: 1, generalOptOutAt: 1 } };
    const contact: any = await ContactProfile.findOneAndUpdate({ _id: contactId, userId }, update, { new: true }); if (!contact) return null;
    await IdentityAudit.create({ userId, contactId, action: 'general_opt_out_changed', actor, reason, metadata: { optedOut } });
    if (optedOut) await this.invalidateContactProposals(userId, contactId, 'general_opt_out', actor);
    return this.getContact(userId, contactId);
  }

  static async proposalDecision(userId: string, leadId: any, platform: string, purpose: string): Promise<{ allowed: boolean; reason?: string; contactId?: string }> {
    const context = await this.contactForLead(userId, leadId); if (!context) return { allowed: true };
    const { contact, identities } = context; const contactId = contact._id.toString();
    if (contact.generalOptOut) return { allowed: false, reason: 'general_opt_out', contactId };
    const identity = identities.find(item => item.leadId.toString() === leadId.toString() && item.platform === platform);
    if (!identity || ['opted_out', 'blocked'].includes(identity.consentStatus)) return { allowed: false, reason: 'channel_not_allowed', contactId };
    if (identities.some(item => item._id.toString() !== identity._id.toString() && ['opted_out', 'blocked'].includes(item.consentStatus))) return { allowed: false, reason: 'cross_channel_opt_out_requires_review', contactId };
    if (contact.preferredChannel && contact.preferredChannel !== platform) return { allowed: false, reason: 'preferred_channel_requires_human_routing', contactId };
    const leadIds = identities.map(item => item.leadId);
    const pending = await AssistedProposal.exists({ userId, leadId: { $in: leadIds }, status: { $in: ['proposed', 'sending', 'failed'] }, purpose: { $in: purpose.includes('meeting') ? ['meeting_scheduling', 'meeting_reminder', 'meeting_followup'] : ['follow_up', 'reactivation'] } });
    return pending ? { allowed: false, reason: 'confirmed_contact_has_pending_proposal', contactId } : { allowed: true, contactId };
  }

  static async validateProposal(proposal: any, now = new Date()): Promise<{ valid: boolean; reason?: string }> {
    const context = await this.contactForLead(proposal.userId.toString(), proposal.leadId?._id || proposal.leadId); if (!context) return { valid: true };
    const { contact, identities } = context; if (contact.generalOptOut) return { valid: false, reason: 'general_opt_out' };
    const identity = identities.find(item => item.leadId.toString() === String(proposal.leadId?._id || proposal.leadId) && item.platform === proposal.platform);
    if (!identity || ['opted_out', 'blocked'].includes(identity.consentStatus)) return { valid: false, reason: 'channel_not_allowed' };
    if (identities.some(item => item._id.toString() !== identity._id.toString() && ['opted_out', 'blocked'].includes(item.consentStatus))) return { valid: false, reason: 'cross_channel_opt_out_requires_review' };
    if (contact.preferredChannel && contact.preferredChannel !== proposal.platform) return { valid: false, reason: 'preferred_channel_changed' };
    if (proposal.recipient?.externalId !== identity.externalId) return { valid: false, reason: 'recipient_no_longer_valid' };
    const leadIds = identities.map(item => item.leadId);
    const activeMeeting = await Meeting.exists({ userId: proposal.userId, leadId: { $in: leadIds }, status: { $in: ['confirmed', 'scheduled', 'pending_configuration'] }, $or: [{ scheduledFor: { $gt: now } }, { scheduledAt: { $gt: now } }, { status: 'pending_configuration' }] });
    if (activeMeeting && !String(proposal.purpose).startsWith('meeting_')) return { valid: false, reason: 'confirmed_meeting' };
    const conversations: any[] = await Conversation.find({ userId: proposal.userId, leadId: { $in: leadIds }, lastMessage: { $gt: proposal.createdAt } }).select('messages lastMessage').lean();
    if (conversations.some(item => item.messages?.at(-1)?.sender === 'lead')) return { valid: false, reason: 'confirmed_identity_replied' };
    return { valid: true };
  }

  static async invalidateForInbound(userId: string, leadId: any, sourceConversationId: any, now = new Date()): Promise<number> {
    const context = await this.contactForLead(userId, leadId); if (!context) return 0; const leadIds = context.identities.map(item => item.leadId);
    const proposals: any[] = await AssistedProposal.find({ userId, leadId: { $in: leadIds }, status: { $in: ['proposed', 'failed'] } }).select('_id conversationId').lean();
    if (!proposals.length) return 0;
    const ids = proposals.map(item => item._id); await AssistedProposal.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: 'confirmed_identity_replied', errorMessage: 'Propuesta caducada: hubo actividad en otra identidad confirmada' } });
    await Task.updateMany({ userId, status: 'pending', $or: [{ 'metadata.proposalId': { $in: ids } }, { 'metadata.contactId': context.contact._id.toString() }] }, { $set: { status: 'cancelled', 'metadata.cancelReason': 'confirmed_identity_replied', 'metadata.cancelledAt': now } });
    await IdentityAudit.create({ userId, contactId: context.contact._id, leadId, action: 'proposal_invalidated_multichannel', actor: 'system', source: sourceConversationId?.toString(), metadata: { proposalCount: ids.length } }); return ids.length;
  }

  private static async invalidateContactProposals(userId: string, contactId: string, reason: string, actor: string): Promise<void> { const identities: any[] = await ContactIdentity.find({ userId, contactId, status: 'active' }).select('leadId').lean(); const proposals: any[] = await AssistedProposal.find({ userId, leadId: { $in: identities.map(item => item.leadId) }, status: { $in: ['proposed', 'failed'] } }).select('_id').lean(); const ids = proposals.map(item => item._id); if (ids.length) { await AssistedProposal.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled', invalidatedAt: new Date(), invalidationReason: reason, errorMessage: `Propuesta caducada: ${reason}` } }); await IdentityAudit.create({ userId, contactId, action: 'proposal_invalidated_multichannel', actor, reason, metadata: { proposalCount: ids.length } }); } }

  static async detectCandidates(limit = 100): Promise<number> {
    const leads: any[] = await Lead.find({ $or: [{ email: { $exists: true, $ne: '' } }, { phone: { $exists: true, $ne: '' } }] }).sort({ createdAt: -1 }).limit(limit).lean(); let created = 0;
    const groups = new Map<string, any[]>();
    for (const lead of leads) for (const [kind, raw] of [['email', lead.email], ['phone', lead.phone]] as const) { const value = kind === 'email' ? String(raw || '').trim().toLowerCase() : String(raw || '').replace(/\D/g, ''); if (!value) continue; const key = `${lead.userId}:${kind}:${value}`; groups.set(key, [...(groups.get(key) || []), lead]); }
    for (const [signal, group] of groups) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      if (group[i]._id.toString() === group[j]._id.toString()) continue; const ids = [group[i]._id.toString(), group[j]._id.toString()].sort(); const candidateKey = crypto.createHash('sha256').update(`${group[i].userId}:${ids.join(':')}`).digest('hex');
      const linked = await ContactIdentity.find({ userId: group[i].userId, leadId: { $in: ids }, status: 'active' }).lean(); if (linked.length === 2 && linked[0].contactId.toString() === linked[1].contactId.toString()) continue;
      const result = await DuplicateCandidate.updateOne({ userId: group[i].userId, candidateKey }, { $setOnInsert: { userId: group[i].userId, leadAId: ids[0], leadBId: ids[1], candidateKey, signals: [signal.split(':', 2)[1]], status: 'pending' } }, { upsert: true }); if (result.upsertedCount) created++;
    }
    return created;
  }

  static async rejectCandidate(userId: string, candidateId: string, actor: string, reason?: string): Promise<any> { const candidate: any = await DuplicateCandidate.findOneAndUpdate({ _id: candidateId, userId, status: 'pending' }, { $set: { status: 'rejected', resolvedAt: new Date(), resolvedBy: actor, resolutionReason: reason?.slice(0, 500) } }, { new: true }); if (candidate) await IdentityAudit.create({ userId, leadId: candidate.leadAId, action: 'link_rejected', actor, reason, metadata: { otherLeadId: candidate.leadBId.toString() } }); return candidate; }
}
