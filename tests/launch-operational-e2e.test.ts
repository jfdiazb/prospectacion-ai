import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Launch from '../src/models/Launch';
import LaunchParticipant from '../src/models/LaunchParticipant';
import LaunchEvent from '../src/models/LaunchEvent';
import LaunchSegmentVersion from '../src/models/LaunchSegmentVersion';
import LaunchAction from '../src/models/LaunchAction';
import Lead from '../src/models/Lead';
import Conversation from '../src/models/Conversation';
import ContactProfile from '../src/models/ContactProfile';
import ContactIdentity from '../src/models/ContactIdentity';
import DuplicateCandidate from '../src/models/DuplicateCandidate';
import Meeting from '../src/models/Meeting';
import Task from '../src/models/Task';
import AssistedProposal from '../src/models/AssistedProposal';
import OutboundMessage from '../src/models/OutboundMessage';
import { LaunchLifecycleService } from '../src/services/LaunchLifecycleService';
import { LaunchSegmentationService } from '../src/services/LaunchSegmentationService';
import { LaunchOperationsService } from '../src/services/LaunchOperationsService';
import { LaunchActionService } from '../src/services/LaunchActionService';
import { LaunchCrmService } from '../src/services/LaunchCrmService';
import { MessagingService } from '../src/services/MessagingService';
import { MetaMessagingProvider } from '../src/integrations/messaging/MetaMessagingProvider';
import { YouTubeMessagingProvider } from '../src/integrations/messaging/YouTubeMessagingProvider';

describe('Launch L1-L5 safe operational scenario', () => {
  let mongo: MongoMemoryServer;
  const owner = new mongoose.Types.ObjectId();
  const otherOwner = new mongoose.Types.ObjectId();
  const base = new Date('2027-10-01T12:00:00Z');
  const manual = (note: string) => ({
    type: 'manual' as const,
    source: 'operational_demo',
    recordedBy: owner.toString(),
    occurredAt: base,
    note,
  });

  beforeAll(async () => {
    process.env.AI_MODE = 'mock';
    process.env.META_MESSAGING_MODE = 'mock';
    process.env.WHATSAPP_MESSAGING_MODE = 'mock';
    process.env.WHATSAPP_AUTO_REPLY_ENABLED = 'false';
    process.env.TIKTOK_MODE = 'mock';
    process.env.YOUTUBE_MESSAGING_MODE = 'mock';
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
    await Promise.all([
      Launch.syncIndexes(),
      LaunchParticipant.syncIndexes(),
      LaunchEvent.syncIndexes(),
      LaunchSegmentVersion.syncIndexes(),
      LaunchAction.syncIndexes(),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongo.stop();
  });

  test('runs the fictional Demo ALMA end-to-end without outbound delivery', async () => {
    const messaging = jest.spyOn(MessagingService, 'send');
    const meta = jest.spyOn(MetaMessagingProvider.prototype, 'sendMessage');
    const youtube = jest.spyOn(YouTubeMessagingProvider.prototype, 'sendMessage');
    const launch: any = await LaunchLifecycleService.createLaunch(owner.toString(), {
      name: 'Lanzamiento Demo ALMA',
      typeKey: 'demo_webinar',
      objective: 'Validación operativa ficticia',
      timezone: 'America/Bogota',
      startsAt: base,
      eventStartsAt: new Date(base.getTime() + 48 * 3600000),
      eventEndsAt: new Date(base.getTime() + 49 * 3600000),
      closesAt: new Date(base.getTime() + 96 * 3600000),
      allowedChannels: ['whatsapp', 'instagram', 'facebook', 'youtube', 'tiktok'],
      registrationConfig: { requireRegistrationForConfirmation: true },
      followUpConfig: {
        assistedOnly: true,
        registrationReminderHours: [1],
        eventReminderMinutes: [60],
        postEventDelayMinutes: 0,
      },
      idempotencyKey: 'demo-alma-create',
      actor: owner.toString(),
    });
    const edited: any = await LaunchLifecycleService.updateLaunch(
      owner.toString(),
      launch._id.toString(),
      {
        description: 'Escenario local seguro',
        timezone: 'America/Bogota',
        idempotencyKey: 'demo-alma-edit',
        actor: owner.toString(),
      }
    );
    expect(edited.configurationVersion).toBe(2);
    const channels = ['whatsapp', 'instagram', 'facebook', 'youtube', 'tiktok'];
    const specs = [
      ['caliente', 90, 'hot', 'whatsapp'],
      ['tibio', 70, 'warm', 'instagram'],
      ['frio', 25, 'cold', 'facebook'],
      ['optout', 95, 'hot', 'whatsapp'],
      ['registrado', 80, 'hot', 'facebook'],
      ['confirmado', 82, 'hot', 'instagram'],
      ['asistente', 88, 'hot', 'whatsapp'],
      ['no-show', 78, 'warm', 'facebook'],
      ['unknown', 68, 'warm', 'youtube'],
      ['reunion', 85, 'hot', 'whatsapp'],
      ['bloqueado', 75, 'warm', 'instagram'],
      ['duplicado-a', 72, 'warm', 'tiktok'],
      ['duplicado-b', 71, 'warm', 'facebook'],
    ] as const;
    const leads: Record<string, any> = {};
    for (const [name, score, interestLevel, channel] of specs) {
      leads[name] = await Lead.create({
        userId: owner,
        username: `demo-${name}`,
        phone: channel === 'whatsapp' ? `57000${score}` : undefined,
        platform: channel,
        currentChannel: channel,
        status: 'interested',
        score,
        interestLevel,
        normalizedIntent: score >= 65 ? 'business_interest' : 'undetermined',
        tags: ['demo_lanzamiento'],
      });
      await Conversation.create({
        userId: owner,
        leadId: leads[name]._id,
        status: 'active',
        lastMessage: new Date(base.getTime() - 3600000),
        messages: [
          {
            sender: 'ai',
            text: 'Contexto ficticio previo',
            timestamp: new Date(base.getTime() - 3600000),
            platform: channel,
          },
        ],
      });
    }
    const optContact: any = await ContactProfile.create({
      userId: owner,
      createdBy: 'fixture',
      generalOptOut: true,
    });
    await ContactIdentity.create({
      userId: owner,
      contactId: optContact._id,
      leadId: leads.optout._id,
      platform: 'whatsapp',
      externalId: 'optout-demo',
      confirmationSource: 'human',
    });
    const blockedContact: any = await ContactProfile.create({
      userId: owner,
      createdBy: 'fixture',
      preferredChannel: 'instagram',
    });
    await ContactIdentity.create({
      userId: owner,
      contactId: blockedContact._id,
      leadId: leads.bloqueado._id,
      platform: 'instagram',
      externalId: 'blocked-demo',
      confirmationSource: 'human',
      consentStatus: 'blocked',
    });
    await DuplicateCandidate.create({
      userId: owner,
      leadAId: leads['duplicado-a']._id,
      leadBId: leads['duplicado-b']._id,
      candidateKey: 'demo-possible-duplicate',
      signals: ['display_name'],
    });
    const definition: any = {
      schemaVersion: 1,
      logic: 'OR',
      rules: [{ id: 'hot', field: 'interest_level', operator: 'eq', value: 'hot' }],
      groups: [
        {
          id: 'warm-score',
          logic: 'AND',
          rules: [
            { id: 'warm', field: 'interest_level', operator: 'eq', value: 'warm' },
            { id: 'score65', field: 'score', operator: 'gte', value: 65 },
          ],
          groups: [],
        },
      ],
    };
    const saved: any = await LaunchSegmentationService.save(
      owner.toString(),
      launch._id.toString(),
      definition,
      owner.toString(),
      'Demo AND/OR'
    );
    const preview: any = await LaunchSegmentationService.preview(
      owner.toString(),
      launch._id.toString(),
      {
        version: saved.version,
        page: 1,
        limit: 100,
        now: base,
        actor: owner.toString(),
        idempotencyKey: 'demo-preview',
      }
    );
    const result = (name: string) =>
      preview.results.find((item: any) => item.leadId.toString() === leads[name]._id.toString());
    expect(result('caliente')).toMatchObject({ eligible: true });
    expect(result('tibio')).toMatchObject({ eligible: true });
    expect(result('frio')).toMatchObject({ eligible: false });
    expect(result('optout')).toMatchObject({ eligible: false, safetyBlocked: true });
    expect(result('bloqueado')).toMatchObject({ eligible: false, safetyBlocked: true });
    expect(result('duplicado-a').possibleDuplicateCandidateIds).toHaveLength(1);
    const selectedNames = [
      'caliente',
      'tibio',
      'registrado',
      'confirmado',
      'asistente',
      'no-show',
      'unknown',
      'reunion',
      'duplicado-a',
    ];
    await LaunchSegmentationService.confirmSelection(owner.toString(), launch._id.toString(), {
      segmentVersion: saved.version,
      decisions: preview.results.map((item: any) => ({
        leadId: item.leadId.toString(),
        selected: selectedNames.some(name => leads[name]._id.toString() === item.leadId.toString()),
        overrideReason: selectedNames.some(
          name => leads[name]._id.toString() === item.leadId.toString()
        )
          ? undefined
          : 'Exclusión humana del demo',
      })),
      idempotencyKey: 'demo-selection',
      actor: owner.toString(),
    });
    const participants: Record<string, any> = {};
    for (const name of selectedNames)
      participants[name] = await LaunchParticipant.findOne({
        launchId: launch._id,
        leadId: leads[name]._id,
      });
    await expect(
      LaunchSegmentationService.addManual(owner.toString(), launch._id.toString(), {
        leadId: leads.optout._id.toString(),
        reason: 'No debe permitirse',
        idempotencyKey: 'unsafe-optout',
        actor: owner.toString(),
      })
    ).rejects.toMatchObject({ code: 'PARTICIPANT_NOT_ALLOWED' });
    await LaunchOperationsService.register(
      owner.toString(),
      launch._id.toString(),
      participants.registrado._id.toString(),
      manual('Registro ficticio'),
      'demo-register',
      owner.toString()
    );
    await LaunchOperationsService.register(
      owner.toString(),
      launch._id.toString(),
      participants.confirmado._id.toString(),
      manual('Registro previo a confirmación'),
      'demo-confirm-register',
      owner.toString()
    );
    await LaunchOperationsService.confirm(
      owner.toString(),
      launch._id.toString(),
      participants.confirmado._id.toString(),
      manual('Confirmación ficticia'),
      'demo-confirm',
      owner.toString()
    );
    for (const name of ['asistente', 'no-show'])
      await LaunchOperationsService.register(
        owner.toString(),
        launch._id.toString(),
        participants[name]._id.toString(),
        manual(`Registro ${name}`),
        `reg-${name}`,
        owner.toString()
      );
    await LaunchOperationsService.attendance(
      owner.toString(),
      launch._id.toString(),
      participants.asistente._id.toString(),
      'attended',
      manual('Asistencia verificada'),
      'demo-attended',
      owner.toString()
    );
    await LaunchOperationsService.attendance(
      owner.toString(),
      launch._id.toString(),
      participants['no-show']._id.toString(),
      'no_show',
      manual('Ausencia verificada'),
      'demo-no-show',
      owner.toString()
    );
    await LaunchOperationsService.attendance(
      owner.toString(),
      launch._id.toString(),
      participants.asistente._id.toString(),
      'unknown',
      manual('Corrección ficticia'),
      'demo-correction',
      owner.toString(),
      'Corrección auditada'
    );
    await LaunchOperationsService.attendance(
      owner.toString(),
      launch._id.toString(),
      participants.asistente._id.toString(),
      'attended',
      manual('Asistencia reverificada'),
      'demo-attended-again',
      owner.toString()
    );
    const meeting: any = await Meeting.create({
      userId: owner,
      leadId: leads.reunion._id,
      status: 'confirmed',
      scheduledFor: new Date(base.getTime() + 7 * 86400000),
    });
    await LaunchOperationsService.attachMeeting(
      owner.toString(),
      launch._id.toString(),
      participants.reunion._id.toString(),
      meeting._id.toString(),
      owner.toString(),
      'demo-meeting-link'
    );
    await LaunchLifecycleService.transitionLaunch(
      owner.toString(),
      launch._id.toString(),
      'scheduled',
      'demo-scheduled',
      owner.toString()
    );
    await LaunchActionService.process(100, base);
    expect(
      await LaunchAction.countDocuments({ launchId: launch._id, kind: 'invitation' })
    ).toBeGreaterThan(0);
    await Launch.updateOne(
      { _id: launch._id },
      {
        $set: {
          eventStartsAt: new Date(base.getTime() - 2 * 3600000),
          eventEndsAt: new Date(base.getTime() - 3600000),
          closesAt: new Date(base.getTime() + 86400000),
          status: 'followup',
        },
        $inc: { configurationVersion: 1 },
      }
    );
    await LaunchActionService.process(200, base);
    expect(
      await LaunchAction.findOne({ launchId: launch._id, kind: 'no_show_recovery' })
    ).not.toBeNull();
    expect(
      await LaunchAction.findOne({ launchId: launch._id, kind: 'post_event_followup' })
    ).not.toBeNull();
    const crm: any = await LaunchCrmService.detail(owner.toString(), launch._id.toString());
    expect(crm.metrics).toMatchObject({
      selected: selectedNames.length,
      registered: 4,
      confirmed: 1,
      attended: 1,
      notAttended: 1,
      unknown: selectedNames.length - 2,
    });
    expect(
      crm.participants.find((item: any) => item.leadId.toString() === leads.reunion._id.toString())
        .meeting.status
    ).toBe('confirmed');
    expect(await Task.countDocuments({ userId: owner })).toBeGreaterThan(0);
    expect(
      await AssistedProposal.countDocuments({ userId: owner, purpose: 'launch_action' })
    ).toBeGreaterThan(0);
    expect(
      await LaunchEvent.countDocuments({ userId: owner, launchId: launch._id })
    ).toBeGreaterThan(15);
    const stale: any = await AssistedProposal.findOne({
      userId: owner,
      purpose: 'launch_action',
      status: 'proposed',
    });
    if (stale) {
      await Lead.updateOne({ _id: stale.leadId }, { $set: { currentChannel: 'tiktok' } });
      expect(await LaunchActionService.validateProposal(stale, base)).toMatchObject({
        valid: false,
        reason: 'channel_changed',
      });
      await LaunchActionService.invalidateProposal(stale._id, 'channel_changed', base);
    }
    const tikTokAction: any = await LaunchAction.findOne({ leadId: leads['duplicado-a']._id });
    expect(tikTokAction).not.toBeNull();
    expect(tikTokAction.recipient?.externalId).toBeUndefined();
    expect(
      await AssistedProposal.countDocuments({
        leadId: leads['duplicado-a']._id,
        platform: 'tiktok',
      })
    ).toBe(0);
    await expect(
      LaunchCrmService.detail(otherOwner.toString(), launch._id.toString())
    ).rejects.toMatchObject({ code: 'LAUNCH_NOT_FOUND' });
    const repeated = await LaunchLifecycleService.updateLaunch(
      owner.toString(),
      launch._id.toString(),
      {
        description: 'No reaplicar',
        timezone: 'America/Bogota',
        idempotencyKey: 'demo-alma-edit',
        actor: owner.toString(),
      }
    );
    expect(repeated).toMatchObject({ description: 'Escenario local seguro', configurationVersion: 4 });
    expect(await OutboundMessage.countDocuments()).toBe(0);
    expect(messaging).not.toHaveBeenCalled();
    expect(meta).not.toHaveBeenCalled();
    expect(youtube).not.toHaveBeenCalled();
    expect(process.env.TIKTOK_MODE).toBe('mock');
    expect(channels).toContain('tiktok');
  }, 30000);
});
