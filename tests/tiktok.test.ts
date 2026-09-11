import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import InboundEvent from '../src/models/InboundEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import { TikTokProvider, TikTokProviderError } from '../src/integrations/tiktok';
import { TikTokIngestionService } from '../src/services/TikTokIngestionService';

const fixture = {
  eventId: 'official-event-1', eventType: 'comment' as const, senderId: 'public-user-1', text: 'INFO por favor',
  occurredAt: '2026-08-20T15:00:00.000Z', videoId: 'video-1', commentId: 'comment-1',
  publicUrl: 'https://www.tiktok.com/@business/video/video-1', senderDisplayName: 'Persona TikTok',
};

describe('TikTok official capability boundary', () => {
  let mongo: MongoMemoryServer;
  let ownerA: mongoose.Types.ObjectId;
  let ownerB: mongoose.Types.ObjectId;

  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    ownerA = new mongoose.Types.ObjectId();
    ownerB = new mongoose.Types.ObjectId();
  });
  afterEach(async () => Promise.all([InboundEvent.deleteMany({}), Lead.deleteMany({}), Conversation.deleteMany({})]));
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  test('normalizes only the allowed public fields from an official comment fixture', () => {
    const normalized = new TikTokProvider().normalizeEvent(fixture);
    expect(normalized).toMatchObject({ externalEventId: fixture.eventId, eventType: 'comment', senderId: fixture.senderId, source: 'tiktok_owned_video_comment', mediaId: fixture.videoId });
    expect(normalized.occurredAt).toEqual(new Date(fixture.occurredAt));
  });

  test('rejects an unsupported API event instead of inventing support', () => {
    expect(() => new TikTokProvider().normalizeEvent({ ...fixture, eventType: 'live_chat' as any }))
      .toThrow(expect.objectContaining({ code: 'API_UNAVAILABLE' }));
  });

  test('keeps ingestion disabled by default', async () => {
    await expect(new TikTokIngestionService(undefined, jest.fn(), false).processOfficialEvent(ownerA.toString(), fixture))
      .rejects.toEqual(expect.objectContaining({ code: 'FEATURE_DISABLED' }));
  });

  test('reports API unavailable when approval transport/orchestrator is absent', async () => {
    await expect(new TikTokIngestionService(undefined, undefined, true).processOfficialEvent(ownerA.toString(), fixture))
      .rejects.toEqual(expect.objectContaining({ code: 'API_UNAVAILABLE' }));
  });

  test('creates a TikTok lead and conversation for an eligible official event', async () => {
    const orchestrator = jest.fn().mockResolvedValue(undefined);
    await expect(new TikTokIngestionService(undefined, orchestrator, true).processOfficialEvent(ownerA.toString(), fixture)).resolves.toBe('processed');
    const lead: any = await Lead.findOne({ userId: ownerA, username: fixture.senderId });
    expect(lead).toMatchObject({ platform: 'tiktok', source: 'tiktok_owned_video_comment', profileUrl: fixture.publicUrl });
    const conversation: any = await Conversation.findOne({ userId: ownerA, leadId: lead._id });
    expect(conversation.messages[0]).toMatchObject({ platform: 'tiktok', text: fixture.text, externalMessageId: fixture.eventId });
    expect(orchestrator).toHaveBeenCalledWith(expect.objectContaining({ userId: ownerA.toString(), isNewLead: true }));
  });

  test('reuses an existing owner lead and rejects a duplicate official identifier', async () => {
    const orchestrator = jest.fn().mockResolvedValue(undefined);
    const service = new TikTokIngestionService(undefined, orchestrator, true);
    expect(await service.processOfficialEvent(ownerA.toString(), fixture)).toBe('processed');
    expect(await service.processOfficialEvent(ownerA.toString(), fixture)).toBe('duplicate');
    expect(await Lead.countDocuments({ userId: ownerA, platform: 'tiktok' })).toBe(1);
    expect(orchestrator).toHaveBeenCalledTimes(1);
  });

  test('keeps leads and conversations isolated by owner', async () => {
    const service = new TikTokIngestionService(undefined, jest.fn().mockResolvedValue(undefined), true);
    await service.processOfficialEvent(ownerA.toString(), fixture);
    await service.processOfficialEvent(ownerB.toString(), { ...fixture, eventId: 'official-event-2' });
    expect(await Lead.countDocuments({ platform: 'tiktok' })).toBe(2);
    expect(await Conversation.countDocuments({ userId: ownerA })).toBe(1);
    expect(await Conversation.countDocuments({ userId: ownerB })).toBe(1);
  });

  test('marks the inbound event failed when the injected external/orchestration boundary errors', async () => {
    const service = new TikTokIngestionService(undefined, jest.fn().mockRejectedValue(new TikTokProviderError('external', 'EXTERNAL_ERROR')), true);
    await expect(service.processOfficialEvent(ownerA.toString(), fixture)).rejects.toEqual(expect.objectContaining({ code: 'EXTERNAL_ERROR' }));
    expect(await InboundEvent.findOne({ externalEventId: fixture.eventId })).toMatchObject({ processingState: 'failed' });
  });

  test('ignores a valid event without the INFO keyword', async () => {
    const orchestrator = jest.fn();
    await expect(new TikTokIngestionService(undefined, orchestrator, true).processOfficialEvent(ownerA.toString(), { ...fixture, text: 'Hola' })).resolves.toBe('not_eligible');
    expect(orchestrator).not.toHaveBeenCalled();
  });
});
