import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import OutboundMessage from '../src/models/OutboundMessage';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';

describe('Launch L1 domain and contracts', () => {
  let mongo: MongoMemoryServer;
  const dates = { startsAt: new Date('2027-08-01T12:00:00Z'), eventStartsAt: new Date('2027-08-10T23:00:00Z'), eventEndsAt: new Date('2027-08-11T00:00:00Z'), closesAt: new Date('2027-08-20T23:00:00Z') };
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([Launch.syncIndexes(), LaunchParticipant.syncIndexes(), LaunchEvent.syncIndexes()]); });
  afterEach(async () => { await Promise.all([Launch.deleteMany({}), LaunchParticipant.deleteMany({}), LaunchEvent.deleteMany({}), Lead.deleteMany({}), Conversation.deleteMany({}), ContactProfile.deleteMany({}), ContactIdentity.deleteMany({}), OutboundMessage.deleteMany({})]); });
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  const createLaunch = (userId = new mongoose.Types.ObjectId(), key = new mongoose.Types.ObjectId().toString()) => LaunchLifecycleService.createLaunch(userId.toString(), { name: 'Lanzamiento genérico', description: 'Sin metodología específica', typeKey: 'generic', objective: 'Validar interés', timezone: 'America/Bogota', ...dates, allowedChannels: ['whatsapp', 'instagram', 'youtube'], registrationConfig: { modes: ['manual'] }, followUpConfig: { assistedOnly: true }, metricsConfig: { evidenceOnly: true }, idempotencyKey: key, actor: 'owner' });
  const createLead = (userId: any, suffix = '') => Lead.create({ userId, username: `launch-lead${suffix}`, platform: 'manual', currentChannel: 'manual', status: 'new' });
  const add = async (userId: any, launch: any, lead: any, key = new mongoose.Types.ObjectId().toString()) => LaunchLifecycleService.addParticipant(userId.toString(), { launchId: launch._id.toString(), leadId: lead._id.toString(), source: 'manual', entryChannel: 'manual', evidence: { type: 'manual', recordedBy: 'owner' }, idempotencyKey: key, actor: 'owner' });

  test('creates a configurable draft launch and its audit event', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId, 'create-one');
    expect(launch).toMatchObject({ userId, status: 'draft', timezone: 'America/Bogota', selectionMode: 'manual', typeKey: 'generic', configurationVersion: 1 });
    expect(await LaunchEvent.findOne({ userId, eventType: 'launch.created' })).toMatchObject({ actor: 'owner', currentState: { status: 'draft' } });
  });

  test('isolates launches by owner', async () => {
    const owner = new mongoose.Types.ObjectId(); const other = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(owner);
    await expect(LaunchLifecycleService.transitionLaunch(other.toString(), launch._id.toString(), 'scheduled', 'other-transition', 'other')).rejects.toMatchObject({ code: 'LAUNCH_NOT_FOUND' });
    expect(await Launch.findOne({ _id: launch._id, userId: other })).toBeNull();
  });

  test('allows multiple launches for one owner and idempotent creation', async () => {
    const userId = new mongoose.Types.ObjectId(); const [one, repeated, two]: any[] = await Promise.all([createLaunch(userId, 'launch-a'), createLaunch(userId, 'launch-a'), createLaunch(userId, 'launch-b')]);
    expect(one._id.toString()).toBe(repeated._id.toString()); expect(two._id.toString()).not.toBe(one._id.toString()); expect(await Launch.countDocuments({ userId })).toBe(2);
  });

  test('applies the valid launch lifecycle and records every transition', async () => {
    const userId = new mongoose.Types.ObjectId(); let launch: any = await createLaunch(userId);
    for (const status of ['scheduled', 'prelaunch', 'live', 'followup', 'completed'] as const) launch = await LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), status, `to-${status}`, 'owner');
    expect(launch).toMatchObject({ status: 'completed', lifecycleVersion: 6 }); expect(await LaunchEvent.countDocuments({ userId, launchId: launch._id })).toBe(6);
  });

  test('rejects contradictory launch transitions', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId);
    await expect(LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), 'live', 'skip', 'owner')).rejects.toMatchObject({ code: 'INVALID_LAUNCH_TRANSITION' });
    expect(await Launch.findById(launch._id)).toMatchObject({ status: 'draft' });
  });

  test('requires coherent dates and a valid IANA timezone', async () => {
    const userId = new mongoose.Types.ObjectId();
    await expect(LaunchLifecycleService.createLaunch(userId.toString(), { name: 'Bad', timezone: 'Bogota/Invalid', idempotencyKey: 'bad-zone', actor: 'owner' })).rejects.toMatchObject({ code: 'INVALID_TIMEZONE' });
    await expect(LaunchLifecycleService.createLaunch(userId.toString(), { name: 'Bad dates', timezone: 'UTC', startsAt: dates.eventStartsAt, eventStartsAt: dates.startsAt, idempotencyKey: 'bad-dates', actor: 'owner' })).rejects.toMatchObject({ code: 'INVALID_DATE_ORDER' });
  });

  test('one lead can participate in multiple launches', async () => {
    const userId = new mongoose.Types.ObjectId(); const lead = await createLead(userId); const [one, two]: any[] = await Promise.all([createLaunch(userId, 'one'), createLaunch(userId, 'two')]);
    await add(userId, one, lead, 'add-one'); await add(userId, two, lead, 'add-two'); expect(await LaunchParticipant.countDocuments({ userId, leadId: lead._id })).toBe(2);
  });

  test('prevents duplicate participant in the same launch under concurrency', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const lead = await createLead(userId);
    const participants: any[] = await Promise.all([add(userId, launch, lead, 'concurrent-a'), add(userId, launch, lead, 'concurrent-b')]);
    expect(participants[0]._id.toString()).toBe(participants[1]._id.toString()); expect(await LaunchParticipant.countDocuments({ userId, launchId: launch._id })).toBe(1);
  });

  test('confirmed multichannel identity prevents the same contact entering twice without merging leads', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const first = await createLead(userId, '-a'); const second = await createLead(userId, '-b'); const contact: any = await ContactProfile.create({ userId, createdBy: 'owner' });
    await ContactIdentity.create([{ userId, contactId: contact._id, leadId: first._id, platform: 'manual', externalId: 'a', confirmationSource: 'human', confirmedBy: 'owner' }, { userId, contactId: contact._id, leadId: second._id, platform: 'manual', externalId: 'b', confirmationSource: 'human', confirmedBy: 'owner' }]);
    const one: any = await add(userId, launch, first, 'contact-a'); const two: any = await add(userId, launch, second, 'contact-b');
    expect(one._id.toString()).toBe(two._id.toString()); expect(await Lead.countDocuments({ userId })).toBe(2);
  });

  test('validates conversation ownership while creating a participant', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const lead = await createLead(userId); const other = await createLead(userId, '-other'); const conversation: any = await Conversation.create({ userId, leadId: other._id, messages: [] });
    await expect(LaunchLifecycleService.addParticipant(userId.toString(), { launchId: launch._id.toString(), leadId: lead._id.toString(), conversationId: conversation._id.toString(), source: 'manual', idempotencyKey: 'wrong-conversation', actor: 'owner' })).rejects.toMatchObject({ code: 'INVALID_CONVERSATION' });
  });

  test('keeps interest, invitation, registration and confirmation as independent facts', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId));
    const interested: any = await LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'stage', status: 'interested', idempotencyKey: 'interest', actor: 'owner' });
    expect(interested).toMatchObject({ stage: { status: 'interested' }, invitation: { status: 'not_invited' }, registration: { status: 'unknown' }, confirmation: { status: 'unknown' }, attendance: { status: 'unknown' } });
  });

  test.each([['registration', 'registered'], ['confirmation', 'confirmed'], ['attendance', 'attended'], ['attendance', 'no_show']] as const)('%s=%s requires evidence', async (dimension, status) => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId));
    await expect(LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension, status: status as any, idempotencyKey: `${dimension}-${status}`, actor: 'owner' })).rejects.toMatchObject({ code: 'EVIDENCE_REQUIRED' });
  });

  test('records registration, confirmation and attendance with distinct evidence', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); let participant: any = await add(userId, launch, await createLead(userId));
    participant = await LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'registration', status: 'registered', evidence: { type: 'form', referenceId: 'form-123' }, idempotencyKey: 'registered', actor: 'owner' });
    participant = await LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'confirmation', status: 'confirmed', evidence: { type: 'manual', note: 'Confirmó por llamada' }, idempotencyKey: 'confirmed', actor: 'owner' });
    participant = await LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'attendance', status: 'attended', evidence: { type: 'provider', referenceId: 'provider-attendance-1' }, idempotencyKey: 'attended', actor: 'owner' });
    expect(participant.registration.evidence).toMatchObject({ type: 'form', referenceId: 'form-123' }); expect(participant.confirmation.evidence).toMatchObject({ type: 'manual' }); expect(participant.attendance.evidence).toMatchObject({ type: 'provider', referenceId: 'provider-attendance-1' });
  });

  test('attendance remains unknown without reliable evidence', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId));
    expect(participant.attendance.status).toBe('unknown'); expect(participant.attendance.evidence).toBeUndefined();
  });

  test('rejects invalid participant lifecycle transitions', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId));
    await expect(LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'stage', status: 'followup', idempotencyKey: 'skip-stage', actor: 'owner' })).rejects.toMatchObject({ code: 'INVALID_PARTICIPANT_TRANSITION' });
  });

  test('participant transition idempotency emits one audit event', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId)); const transition = { participantId: participant._id.toString(), dimension: 'stage' as const, status: 'interested' as const, idempotencyKey: 'same-interest', actor: 'owner' };
    const [one, two]: any[] = await Promise.all([LaunchLifecycleService.transitionParticipant(userId.toString(), transition), LaunchLifecycleService.transitionParticipant(userId.toString(), transition)]);
    expect(one.stage.status).toBe('interested'); expect(two.stage.status).toBe('interested'); expect(await LaunchEvent.countDocuments({ userId, idempotencyKey: 'same-interest' })).toBe(1);
  });

  test('cancel is terminal, idempotent and audited', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const [one, two]: any[] = await Promise.all([LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), 'cancelled', 'cancel-once', 'owner', 'Decisión humana'), LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), 'cancelled', 'cancel-once', 'owner', 'Decisión humana')]);
    expect(one.status).toBe('cancelled'); expect(two.status).toBe('cancelled'); expect(await LaunchEvent.countDocuments({ userId, idempotencyKey: 'cancel-once' })).toBe(1);
    await expect(LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), 'scheduled', 'reopen', 'owner')).rejects.toMatchObject({ code: 'INVALID_LAUNCH_TRANSITION' });
  });

  test('blocks rejected and confirmed opted-out contacts', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const rejected: any = await Lead.create({ userId, username: 'rejected', platform: 'manual', status: 'rejected' });
    await expect(add(userId, launch, rejected, 'rejected-add')).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_ALLOWED' });
    const lead = await createLead(userId); const contact: any = await ContactProfile.create({ userId, createdBy: 'owner', generalOptOut: true }); await ContactIdentity.create({ userId, contactId: contact._id, leadId: lead._id, platform: 'manual', externalId: 'optout', confirmationSource: 'human', confirmedBy: 'owner' });
    await expect(add(userId, launch, lead, 'optout-add')).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_ALLOWED' });
  });

  test('L1 never creates an outbound message', async () => {
    const userId = new mongoose.Types.ObjectId(); const launch: any = await createLaunch(userId); const participant: any = await add(userId, launch, await createLead(userId));
    await LaunchLifecycleService.transitionParticipant(userId.toString(), { participantId: participant._id.toString(), dimension: 'stage', status: 'interested', idempotencyKey: 'safe-transition', actor: 'owner' });
    await LaunchLifecycleService.transitionLaunch(userId.toString(), launch._id.toString(), 'cancelled', 'safe-cancel', 'owner'); expect(await OutboundMessage.countDocuments({})).toBe(0);
  });
});
