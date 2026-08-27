import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import InboundEvent from '../src/models/InboundEvent';
import OutboundMessage from '../src/models/OutboundMessage';
import Meeting from '../src/models/Meeting';
import HunterOpportunity from '../src/models/HunterOpportunity';
import { LeadService } from '../src/services/LeadService';
import { HunterService } from '../src/services/HunterService';
import { MeetingLifecycleService } from '../src/services/MeetingLifecycleService';
import { MeetingProviderError, type MeetingProvider } from '../src/integrations/meetings';

describe('Phase 8 MVP consolidation', () => {
  let mongo: MongoMemoryServer;
  let mongoPath: string;
  const ownerA = new mongoose.Types.ObjectId();
  const ownerB = new mongoose.Types.ObjectId();

  beforeAll(async () => {
    mongoPath = path.join(process.cwd(), `.mongo-phase8-${process.pid}-${Date.now()}`);
    fs.mkdirSync(mongoPath);
    mongo = await MongoMemoryServer.create({ instance: { dbPath: mongoPath } });
    await mongoose.connect(mongo.getUri());
    await Promise.all([InboundEvent.init(), OutboundMessage.init()]);
  });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); if (mongoPath.startsWith(`${process.cwd()}${path.sep}.mongo-phase8-`)) fs.rmSync(mongoPath, { recursive: true, force: true }); });
  beforeEach(async () => { await Promise.all(Object.values(mongoose.connection.collections).map(collection => collection.deleteMany({}))); });

  const lead = (userId: mongoose.Types.ObjectId, username: string, overrides = {}) => Lead.create({ userId, username, platform: 'youtube', status: 'new', interestLevel: 'cold', ...overrides });

  test('does not allow a lead update payload to transfer ownership', async () => {
    const created: any = await lead(ownerA, 'owner-safe');
    await LeadService.updateLead(created._id.toString(), ownerA.toString(), { userId: ownerB } as any);
    expect((await Lead.findById(created._id))?.userId.toString()).toBe(ownerA.toString());
    expect(await LeadService.getLeadById(created._id.toString(), ownerB.toString())).toBeNull();
  });

  test('scopes inbound and outbound idempotency keys by owner', async () => {
    await InboundEvent.create({ userId: ownerA, externalEventId: 'shared-event', channel: 'youtube', eventType: 'comment', senderId: 'a' });
    await InboundEvent.create({ userId: ownerB, externalEventId: 'shared-event', channel: 'youtube', eventType: 'comment', senderId: 'b' });
    const leadA: any = await lead(ownerA, 'a'); const leadB: any = await lead(ownerB, 'b');
    const conversationA: any = await Conversation.create({ userId: ownerA, leadId: leadA._id, platform: 'youtube' });
    const conversationB: any = await Conversation.create({ userId: ownerB, leadId: leadB._id, platform: 'youtube' });
    const base = { sourceEventId: 'shared-outbound', channel: 'youtube', messageType: 'youtube_reply', text: 'ok', deliveryStatus: 'simulated', provider: 'mock', recipientId: 'root' };
    await OutboundMessage.create({ ...base, userId: ownerA, leadId: leadA._id, conversationId: conversationA._id });
    await OutboundMessage.create({ ...base, userId: ownerB, leadId: leadB._id, conversationId: conversationB._id });
    expect(await InboundEvent.countDocuments({ externalEventId: 'shared-event' })).toBe(2);
    expect(await OutboundMessage.countDocuments({ sourceEventId: 'shared-outbound' })).toBe(2);
  });

  test('returns only real persisted Dashboard metrics', async () => {
    await lead(ownerA, 'new-youtube', { createdAt: new Date(), interestLevel: 'hot' });
    await lead(ownerA, 'registered-whatsapp', { platform: 'whatsapp', status: 'registered', createdAt: new Date() });
    await lead(ownerB, 'foreign', { status: 'registered' });
    const stats: any = await LeadService.getLeadStats(ownerA.toString());
    expect(stats).toMatchObject({ totalLeads: 2, newLeads: 1, hotLeads: 1, registeredLeads: 1 });
    expect(stats.weeklyLeads.reduce((sum: number, item: any) => sum + item.leads, 0)).toBe(2);
    expect(stats.channelPerformance).toEqual(expect.arrayContaining([{ name: 'youtube', value: 1 }, { name: 'whatsapp', value: 1 }]));
  });

  test('completes Hunter opportunity to CRM lead without crossing owners', async () => {
    const opportunity: any = await HunterService.saveOpportunity(ownerA.toString(), { username: 'channel-a', platform: 'youtube', kind: 'channel', youtubeChannelId: 'channel-a', youtubeVideoId: 'video-a', profileUrl: 'https://youtube.com/watch?v=video-a', fullName: 'Canal A', score: 80 } as any);
    await expect(HunterService.convertOpportunity(ownerB.toString(), opportunity._id.toString())).rejects.toThrow('Oportunidad no encontrada');
    const converted: any = await HunterService.convertOpportunity(ownerA.toString(), opportunity._id.toString());
    expect(converted.lead).toMatchObject({ userId: ownerA, platform: 'youtube', username: 'channel-a', source: 'youtube_lead_hunter' });
    expect(await HunterOpportunity.findOne({ _id: opportunity._id, userId: ownerA })).toMatchObject({ status: 'converted' });
  });

  test('blocks an ambiguous Zoom retry to avoid duplicate creation', async () => {
    const createdLead: any = await lead(ownerA, 'meeting');
    const conversation: any = await Conversation.create({ userId: ownerA, leadId: createdLead._id, platform: 'youtube' });
    const meeting: any = await Meeting.create({ userId: ownerA, leadId: createdLead._id, conversationId: conversation._id, status: 'failed', provider: 'zoom', selectedSlot: new Date(Date.now() + 86400000), errorCode: 'ZOOM_TIMEOUT' });
    let calls = 0;
    const provider: MeetingProvider = { name: 'zoom', createMeeting: async () => { calls++; throw new MeetingProviderError('timeout', 'ZOOM_TIMEOUT'); } };
    const outcome = await new MeetingLifecycleService(provider).confirm({ userId: ownerA.toString(), leadId: createdLead._id.toString(), conversationId: conversation._id.toString(), sourceEventId: 'retry' });
    expect(outcome.reply).toContain('ambiguo');
    expect(calls).toBe(0);
    expect((await Meeting.findById(meeting._id))?.status).toBe('failed');
  });
});
