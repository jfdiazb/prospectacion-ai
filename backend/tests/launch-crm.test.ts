import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchAction from '../src/models/LaunchAction';
import Lead from '../src/models/Lead';
import OutboundMessage from '../src/models/OutboundMessage';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchCrmService } from '../src/services/LaunchCrmService';

describe('Launch L5 CRM queries', () => {
  let mongo: MongoMemoryServer;
  beforeAll(async () => {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
      LaunchAction.syncIndexes(),
    ]);
  });
  afterEach(async () => {
    await Promise.all([
      Launch.deleteMany({}),
      LaunchParticipant.deleteMany({}),
      LaunchEvent.deleteMany({}),
      LaunchAction.deleteMany({}),
      Lead.deleteMany({}),
      OutboundMessage.deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });
  const create = (owner: mongoose.Types.ObjectId, key = 'launch-l5') =>
    LaunchLifecycleService.createLaunch(owner.toString(), {
      name: 'L5',
      typeKey: 'webinar',
      timezone: 'America/Bogota',
      startsAt: new Date('2027-08-01T00:00:00Z'),
      eventStartsAt: new Date('2027-08-10T00:00:00Z'),
      closesAt: new Date('2027-08-20T00:00:00Z'),
      allowedChannels: ['whatsapp'],
      idempotencyKey: key,
      actor: owner.toString(),
    });
  test('lists and enriches only launches belonging to the owner', async () => {
    const owner = new mongoose.Types.ObjectId(),
      other = new mongoose.Types.ObjectId();
    const launch: any = await create(owner);
    await create(other, 'other');
    const lead: any = await Lead.create({
      userId: owner,
      username: 'ana',
      platform: 'whatsapp',
      currentChannel: 'whatsapp',
      status: 'new',
      score: 70,
    });
    const participant: any = await LaunchLifecycleService.addParticipant(owner.toString(), {
      launchId: launch._id.toString(),
      leadId: lead._id.toString(),
      source: 'manual',
      entryChannel: 'whatsapp',
      idempotencyKey: 'add',
      actor: owner.toString(),
    });
    await LaunchAction.create({
      userId: owner,
      launchId: launch._id,
      participantId: participant._id,
      leadId: lead._id,
      kind: 'invitation',
      idempotencyKey: 'action',
      dueAt: new Date(),
      status: 'pending',
      launchSnapshot: {},
      participantSnapshot: {},
    });
    const list: any[] = await LaunchCrmService.list(owner.toString());
    expect(list).toHaveLength(1);
    expect(list[0].metrics).toMatchObject({ selected: 1, pendingActions: 1 });
    const detail: any = await LaunchCrmService.detail(owner.toString(), launch._id.toString());
    expect(detail.participants[0].lead).toMatchObject({ username: 'ana', score: 70 });
    expect(detail.actions).toHaveLength(1);
    await expect(
      LaunchCrmService.detail(other.toString(), launch._id.toString())
    ).rejects.toMatchObject({ code: 'LAUNCH_NOT_FOUND' });
  });
  test('updates configuration with validation, audit and optimistic concurrency', async () => {
    const owner = new mongoose.Types.ObjectId();
    const launch: any = await create(owner);
    const updated: any = await LaunchLifecycleService.updateLaunch(
      owner.toString(),
      launch._id.toString(),
      {
        name: 'L5 actualizado',
        timezone: 'UTC',
        allowedChannels: ['instagram'],
        idempotencyKey: 'update-l5',
        actor: owner.toString(),
      }
    );
    expect(updated).toMatchObject({
      name: 'L5 actualizado',
      timezone: 'UTC',
      configurationVersion: 2,
    });
    const repeated: any = await LaunchLifecycleService.updateLaunch(
      owner.toString(),
      launch._id.toString(),
      {
        name: 'No debe reaplicarse',
        timezone: 'UTC',
        idempotencyKey: 'update-l5',
        actor: owner.toString(),
      }
    );
    expect(repeated).toMatchObject({ name: 'L5 actualizado', configurationVersion: 2 });
    expect(await LaunchEvent.findOne({ eventType: 'launch.configuration_changed' })).not.toBeNull();
    await expect(
      LaunchLifecycleService.updateLaunch(owner.toString(), launch._id.toString(), {
        timezone: 'Invalid/Zone',
        idempotencyKey: 'bad',
        actor: owner.toString(),
      })
    ).rejects.toMatchObject({ code: 'INVALID_TIMEZONE' });
    expect(await OutboundMessage.countDocuments()).toBe(0);
  });
});
