import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import DuplicateCandidate from '../src/models/DuplicateCandidate';
import IdentityAudit from '../src/models/IdentityAudit';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import Task from '../src/models/Task';
import Meeting from '../src/models/Meeting';
import { MultichannelIdentityService } from '../src/services/MultichannelIdentityService';
import { ConversationService } from '../src/services/ConversationService';
import { TaskService } from '../src/services/TaskService';

describe('Safe confirmed multichannel follow-up', () => {
  let mongo: MongoMemoryServer; const originalEnv = process.env;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([ContactIdentity.syncIndexes(), DuplicateCandidate.syncIndexes()]); });
  beforeEach(() => { process.env = { ...originalEnv, AI_MODE: 'mock', META_MESSAGING_MODE: 'mock', WHATSAPP_MESSAGING_MODE: 'mock' }; });
  afterEach(async () => { process.env = originalEnv; await Promise.all([Lead.deleteMany({}), Conversation.deleteMany({}), ContactProfile.deleteMany({}), ContactIdentity.deleteMany({}), DuplicateCandidate.deleteMany({}), IdentityAudit.deleteMany({}), AssistedProposal.deleteMany({}), OutboundMessage.deleteMany({}), Task.deleteMany({}), Meeting.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const leads = async (userId = new mongoose.Types.ObjectId()) => {
    const whatsapp: any = await Lead.create({ userId, username: 'persona-w', fullName: 'Ana Pérez', platform: 'whatsapp', currentChannel: 'whatsapp', phone: '+57 300 111 2233', email: 'ana@example.com', status: 'follow_up' });
    const instagram: any = await Lead.create({ userId, username: 'ig-scoped-ana', fullName: 'Ana Pérez', platform: 'instagram', currentChannel: 'instagram', email: 'ana@example.com', status: 'follow_up' });
    const whatsappConversation: any = await Conversation.create({ userId, leadId: whatsapp._id, status: 'active', controlMode: 'automated', lastMessage: new Date('2027-01-01'), messages: [{ sender: 'ai', text: 'Seguimos en contacto', platform: 'whatsapp', timestamp: new Date('2027-01-01') }] });
    const instagramConversation: any = await Conversation.create({ userId, leadId: instagram._id, status: 'active', controlMode: 'automated', lastMessage: new Date('2027-01-01'), messages: [{ sender: 'ai', text: 'Seguimos en contacto', platform: 'instagram', timestamp: new Date('2027-01-01') }] });
    return { userId, whatsapp, instagram, whatsappConversation, instagramConversation };
  };

  test('links the same explicitly confirmed person across two channels without merging leads', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'crm_explicit_link', 'La persona confirmó ambos canales');
    expect(contact.identities).toHaveLength(2); expect(await Lead.countDocuments({ userId: data.userId })).toBe(2); expect(await Conversation.countDocuments({ userId: data.userId })).toBe(2);
    expect(await IdentityAudit.countDocuments({ userId: data.userId, action: 'link_created' })).toBe(2);
  });

  test('similar names alone never create a candidate or merge', async () => {
    const userId = new mongoose.Types.ObjectId(); await Lead.create([{ userId, username: 'ana1', fullName: 'Ana Pérez', platform: 'instagram' }, { userId, username: 'ana2', fullName: 'Ana Perez', platform: 'facebook' }]);
    expect(await MultichannelIdentityService.detectCandidates()).toBe(0); expect(await DuplicateCandidate.countDocuments({})).toBe(0); expect(await ContactProfile.countDocuments({})).toBe(0);
  });

  test('exact contact signal creates only a possible duplicate for human review', async () => {
    const data = await leads(); expect(await MultichannelIdentityService.detectCandidates()).toBe(1); const candidate: any = await DuplicateCandidate.findOne({ userId: data.userId });
    expect(candidate).toMatchObject({ status: 'pending', signals: ['email'] }); expect(await ContactIdentity.countDocuments({})).toBe(0);
    expect(await MultichannelIdentityService.detectCandidates()).toBe(0);
  });

  test('can reject a candidate and audit that decision', async () => {
    const data = await leads(); await MultichannelIdentityService.detectCandidates(); const candidate: any = await DuplicateCandidate.findOne({ userId: data.userId }); await MultichannelIdentityService.rejectCandidate(data.userId.toString(), candidate._id.toString(), 'owner', 'Son personas distintas');
    expect(await DuplicateCandidate.findById(candidate._id)).toMatchObject({ status: 'rejected' }); expect(await IdentityAudit.findOne({ action: 'link_rejected' })).not.toBeNull();
  });

  test('unlink is non-destructive and auditable', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit'); const identity = contact.identities[0];
    await MultichannelIdentityService.unlink(data.userId.toString(), identity._id.toString(), 'owner', 'Corrección manual'); expect(await Lead.countDocuments({ userId: data.userId })).toBe(2); expect(await ContactIdentity.findById(identity._id)).toMatchObject({ status: 'unlinked' }); expect(await IdentityAudit.findOne({ action: 'link_removed' })).not.toBeNull();
  });

  test('preferred channel governs future proposal selection and no preference keeps origin channel', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit');
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.instagram._id, 'instagram', 'follow_up')).toMatchObject({ allowed: true });
    await MultichannelIdentityService.setPreferredChannel(data.userId.toString(), contact._id.toString(), 'whatsapp', 'owner');
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.instagram._id, 'instagram', 'follow_up')).toMatchObject({ allowed: false, reason: 'preferred_channel_requires_human_routing' });
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.whatsapp._id, 'whatsapp', 'follow_up')).toMatchObject({ allowed: true });
  });

  test('general opt-out blocks every confirmed channel and channel opt-out is conservative', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit'); const ig = contact.identities.find((item: any) => item.platform === 'instagram');
    await MultichannelIdentityService.setChannelConsent(data.userId.toString(), ig._id.toString(), 'opted_out', 'owner', 'Solicitado en Instagram');
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.instagram._id, 'instagram', 'follow_up')).toMatchObject({ allowed: false, reason: 'channel_not_allowed' });
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.whatsapp._id, 'whatsapp', 'follow_up')).toMatchObject({ allowed: false, reason: 'cross_channel_opt_out_requires_review' });
    await MultichannelIdentityService.setGeneralOptOut(data.userId.toString(), contact._id.toString(), true, 'owner', 'No contactar');
    expect(await MultichannelIdentityService.proposalDecision(data.userId.toString(), data.whatsapp._id, 'whatsapp', 'follow_up')).toMatchObject({ allowed: false, reason: 'general_opt_out' });
  });

  test('reply on another confirmed channel expires all pending proposals and tasks', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit');
    const proposal: any = await AssistedProposal.create({ userId: data.userId, leadId: data.whatsapp._id, conversationId: data.whatsappConversation._id, sourceEventId: 'followup:cross-channel', platform: 'whatsapp', recipient: { type: 'whatsapp_user', externalId: '+57 300 111 2233' }, text: 'Propuesta', originalText: 'Propuesta', purpose: 'follow_up', status: 'proposed' });
    await Task.create({ userId: data.userId, leadId: data.whatsapp._id, conversationId: data.whatsappConversation._id, title: 'Global', description: 'Pendiente', type: 'follow_up', status: 'pending', metadata: { contactId: contact._id.toString(), proposalId: proposal._id } });
    await ConversationService.addMessage(data.instagramConversation._id.toString(), data.userId.toString(), { sender: 'lead', text: 'Respondí por Instagram', platform: 'instagram' });
    expect(await AssistedProposal.findById(proposal._id)).toMatchObject({ status: 'cancelled', invalidationReason: 'confirmed_identity_replied' }); expect(await Task.findOne({ 'metadata.contactId': contact._id.toString() })).toMatchObject({ status: 'cancelled' }); expect(await IdentityAudit.findOne({ action: 'proposal_invalidated_multichannel' })).not.toBeNull();
  });

  test('one confirmed contact gets one global pending task while unlinked leads remain separate', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit');
    await Promise.all([TaskService.upsertPendingFollowUp(data.userId.toString(), { leadId: data.whatsapp._id, conversationId: data.whatsappConversation._id, title: 'Uno', description: 'A', type: 'follow_up', status: 'pending', metadata: { contactId: contact._id.toString(), followUpPurpose: 'general_follow_up' } }), TaskService.upsertPendingFollowUp(data.userId.toString(), { leadId: data.instagram._id, conversationId: data.instagramConversation._id, title: 'Dos', description: 'B', type: 'follow_up', status: 'pending', metadata: { contactId: contact._id.toString(), followUpPurpose: 'general_follow_up' } })]);
    expect(await Task.countDocuments({ userId: data.userId })).toBe(1);
    const separate = await leads(new mongoose.Types.ObjectId()); await Promise.all([TaskService.upsertPendingFollowUp(separate.userId.toString(), { leadId: separate.whatsapp._id, conversationId: separate.whatsappConversation._id, title: 'A', description: 'A', type: 'follow_up', status: 'pending', metadata: { followUpPurpose: 'general_follow_up' } }), TaskService.upsertPendingFollowUp(separate.userId.toString(), { leadId: separate.instagram._id, conversationId: separate.instagramConversation._id, title: 'B', description: 'B', type: 'follow_up', status: 'pending', metadata: { followUpPurpose: 'general_follow_up' } })]); expect(await Task.countDocuments({ userId: separate.userId })).toBe(2);
  });

  test('preference change and confirmed meeting invalidate old commercial proposals', async () => {
    const data = await leads(); const contact: any = await MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit'); const proposal: any = await AssistedProposal.create({ userId: data.userId, leadId: data.instagram._id, conversationId: data.instagramConversation._id, sourceEventId: 'old-proposal', platform: 'instagram', recipient: { type: 'instagram_user', externalId: 'ig-scoped-ana' }, text: 'Hola', originalText: 'Hola', purpose: 'reactivation', status: 'proposed' });
    await MultichannelIdentityService.setPreferredChannel(data.userId.toString(), contact._id.toString(), 'whatsapp', 'owner'); expect(await AssistedProposal.findById(proposal._id)).toMatchObject({ status: 'cancelled', invalidationReason: 'preferred_channel_changed' });
    const second: any = await AssistedProposal.create({ userId: data.userId, leadId: data.whatsapp._id, conversationId: data.whatsappConversation._id, sourceEventId: 'meeting-invalidates', platform: 'whatsapp', recipient: { type: 'whatsapp_user', externalId: '+57 300 111 2233' }, text: 'Hola', originalText: 'Hola', purpose: 'follow_up', status: 'proposed' }); await Meeting.create({ userId: data.userId, leadId: data.instagram._id, conversationId: data.instagramConversation._id, status: 'confirmed', scheduledFor: new Date(Date.now() + 86400000) }); expect(await MultichannelIdentityService.validateProposal(second)).toMatchObject({ valid: false, reason: 'confirmed_meeting' });
  });

  test('concurrent explicit linking is idempotent and isolated by owner', async () => {
    const data = await leads(); const results = await Promise.all([MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit'), MultichannelIdentityService.linkLeads(data.userId.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'owner', 'explicit')]);
    expect(results[0].identities).toHaveLength(2); expect(await ContactIdentity.countDocuments({ userId: data.userId, status: 'active' })).toBe(2);
    const other = new mongoose.Types.ObjectId(); await expect(MultichannelIdentityService.linkLeads(other.toString(), [data.whatsapp._id.toString(), data.instagram._id.toString()], 'other', 'explicit')).rejects.toThrow(/propietario/);
  });

  test('YouTube identity never fabricates a DM recipient and no operation auto-sends', async () => {
    const userId = new mongoose.Types.ObjectId(); const youtube: any = await Lead.create({ userId, username: 'youtube-channel', platform: 'youtube' }); const whatsapp: any = await Lead.create({ userId, username: 'wa', phone: '57300999', platform: 'whatsapp' }); await MultichannelIdentityService.linkLeads(userId.toString(), [youtube._id.toString(), whatsapp._id.toString()], 'owner', 'explicit');
    expect(await MultichannelIdentityService.proposalDecision(userId.toString(), youtube._id, 'youtube', 'follow_up')).toMatchObject({ allowed: true }); expect(await AssistedProposal.countDocuments({})).toBe(0); expect(await OutboundMessage.countDocuments({})).toBe(0);
  });
});
