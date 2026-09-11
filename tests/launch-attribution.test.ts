import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import Meeting from '../src/models/Meeting';
import QualificationHistory from '../src/models/QualificationHistory';
import { LaunchAttributionService } from '../src/services/LaunchAttributionService';
import { MeetingReadinessService } from '../src/services/MeetingReadinessService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
import { QualificationApplicationService } from '../src/services/QualificationApplicationService';
import { MeetingOrchestratorService } from '../src/services/MeetingOrchestratorService';
import { MeetingLifecycleService } from '../src/services/MeetingLifecycleService';
import { LaunchOperationsService } from '../src/services/LaunchOperationsService';

describe('Launch commercial attribution', () => {
  let mongo: MongoMemoryServer;
  const originalEnv = process.env;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
  beforeEach(() => { process.env = { ...originalEnv, SCHEDULING_MODE: 'calendly', CALENDLY_BOOKING_URL: 'https://calendly.com/alma/discovery', NODE_ENV: 'test', REAL_OUTBOUND_ENABLED: 'false' }; });
  afterEach(async () => { process.env = originalEnv; await Promise.all([Launch.deleteMany({}), LaunchParticipant.deleteMany({}), Lead.deleteMany({}), Conversation.deleteMany({}), Meeting.deleteMany({}), QualificationHistory.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const prepare = async (withLaunch = true, suffix = 'a') => {
    const userId = new mongoose.Types.ObjectId();
    const lead: any = await Lead.create({ userId, username: `lead-${suffix}`, platform: 'youtube' });
    const conversation: any = await Conversation.create({ userId, leadId: lead._id, messages: [] });
    if (!withLaunch) return { userId, lead, conversation };
    const launch: any = await Launch.create({ userId, name: `Launch ${suffix}`, timezone: 'America/Bogota', creationKey: `launch-${suffix}`, createdBy: 'test' });
    const participant: any = await LaunchParticipant.create({ userId, launchId: launch._id, leadId: lead._id, conversationId: conversation._id, participantKey: `lead:${lead._id}`, source: 'test', addedBy: 'test' });
    return { userId, lead, conversation, launch, participant };
  };

  test('A/I keeps leads and historical conversations without launch attribution compatible', async () => {
    const item = await prepare(false);
    expect(await LaunchAttributionService.resolve(item.userId.toString(), item.lead._id.toString(), item.conversation._id.toString())).toBeUndefined();
    const readiness = MeetingReadinessService.evaluate(['Quiero más información'], analyzeWhatsAppConversation(['Quiero más información']));
    expect(readiness).toMatchObject({ ready: false, reason: 'needs_discovery' });
    expect(readiness.launchId).toBeUndefined();
  });

  test('B/C/D propagates launch through lead, conversation, qualification, follow-up metadata and readiness', async () => {
    const item: any = await prepare();
    const attribution = await LaunchAttributionService.resolve(item.userId.toString(), item.lead._id.toString(), item.conversation._id.toString());
    expect(attribution).toEqual({ launchId: item.launch._id.toString(), participantId: item.participant._id.toString() });
    const texts = ['Me interesa la oportunidad de negocio y quiero aprender a conseguir clientes', 'Actualmente tengo un negocio y mi problema es el seguimiento', 'Quiero conocer una solución y el siguiente paso'];
    const evaluation = analyzeWhatsAppConversation(texts);
    const readiness = MeetingReadinessService.evaluate(texts, evaluation, attribution);
    const applied = await QualificationApplicationService.apply({ userId: item.userId.toString(), leadId: item.lead._id.toString(), conversationId: item.conversation._id.toString(), sourceEventId: 'qualification-launch', platform: 'youtube', source: 'test', text: texts.at(-1)!, isNewLead: false, launchId: attribution!.launchId, launchParticipantId: attribution!.participantId, meetingReadiness: readiness, evaluation });
    await LaunchAttributionService.recordReadiness(item.userId.toString(), attribution, readiness, true);
    expect(await Conversation.findById(item.conversation._id)).toMatchObject({ launchId: item.launch._id, launchParticipantId: item.participant._id });
    expect((await Lead.findById(item.lead._id))?.get('launchIds').map(String)).toContain(item.launch._id.toString());
    expect(await QualificationHistory.findOne({ sourceEventId: 'qualification-launch' })).toMatchObject({ launchId: item.launch._id, launchParticipantId: item.participant._id });
    expect(LaunchAttributionService.metadata(attribution)).toEqual({ launchId: item.launch._id.toString(), launchParticipantId: item.participant._id.toString() });
    expect(readiness).toMatchObject({ ready: true, launchId: item.launch._id.toString(), launchParticipantId: item.participant._id.toString() });
    expect(applied.current).toBeTruthy();
  });

  test('E/F attributes Calendly and completed result to the correct launch metrics', async () => {
    const item: any = await prepare();
    const attribution = await LaunchAttributionService.resolve(item.userId.toString(), item.lead._id.toString(), item.conversation._id.toString());
    const outcome = await MeetingOrchestratorService.process({ userId: item.userId.toString(), leadId: item.lead._id.toString(), conversationId: item.conversation._id.toString(), sourceEventId: 'meeting-launch', text: 'Quiero agendar una llamada', wantsMeeting: true, meetingReadiness: 'explicit_request', launchId: attribution!.launchId, launchParticipantId: attribution!.participantId, platform: 'youtube' });
    expect(outcome.reply).toContain('calendly.com');
    const meeting: any = await Meeting.findOne({ conversationId: item.conversation._id });
    expect(meeting).toMatchObject({ launchId: item.launch._id, launchParticipantId: item.participant._id, provider: 'calendly' });
    expect(await LaunchParticipant.findById(item.participant._id)).toMatchObject({ meetingId: meeting._id, outcome: { status: 'meeting_requested' } });
    await Meeting.updateOne({ _id: meeting._id }, { $set: { status: 'scheduled' } });
    await new MeetingLifecycleService().complete(item.userId.toString(), meeting._id.toString());
    expect(await LaunchParticipant.findById(item.participant._id)).toMatchObject({ outcome: { status: 'converted' } });
    expect(await LaunchOperationsService.metrics(item.userId.toString(), item.launch._id.toString())).toMatchObject({ selected: 1, conversations: 1, meetings: 1, converted: 1 });
  });

  test('G never crosses meetings between two launches', async () => {
    const item: any = await prepare();
    const launchB: any = await Launch.create({ userId: item.userId, name: 'Launch B', timezone: 'America/Bogota', creationKey: 'launch-b', createdBy: 'test' });
    const participantB: any = await LaunchParticipant.create({ userId: item.userId, launchId: launchB._id, leadId: item.lead._id, participantKey: `lead:${item.lead._id}`, source: 'test', addedBy: 'test' });
    const meeting: any = await Meeting.create({ userId: item.userId, leadId: item.lead._id, conversationId: item.conversation._id, launchId: item.launch._id, launchParticipantId: item.participant._id, provider: 'calendly' });
    await expect(LaunchAttributionService.attachMeeting(item.userId.toString(), { launchId: launchB._id.toString(), participantId: participantB._id.toString() }, meeting._id)).rejects.toThrow(/otro lanzamiento/);
    expect((await LaunchParticipant.findById(participantB._id))?.meetingId).toBeUndefined();
    expect(await Meeting.findById(meeting._id)).toMatchObject({ launchId: item.launch._id, launchParticipantId: item.participant._id });
  });
});
