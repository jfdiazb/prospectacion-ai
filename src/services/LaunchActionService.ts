import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchAction from '../models/LaunchAction';
import LaunchEvent from '../models/LaunchEvent';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import Meeting from '../models/Meeting';
import Task from '../models/Task';
import AssistedProposal from '../models/AssistedProposal';
import { FollowUpPolicyService } from './FollowUpService';
import { TaskService } from './TaskService';
import { MultichannelIdentityService } from './MultichannelIdentityService';
import { CommercialContextService } from './CommercialContextService';
import { ConversationService } from './ConversationService';
import { AutomationEngineService } from './AutomationEngineService';
import { getAIProvider } from '../integrations/ai';
import { AlmaService } from './AlmaService';

type Kind =
  | 'invitation'
  | 'registration_reminder'
  | 'event_reminder'
  | 'pre_event_message'
  | 'post_event_followup'
  | 'no_show_recovery'
  | 'interested_followup'
  | 'next_step_proposal';
const proposalKinds = new Set<Kind>([
  'invitation',
  'registration_reminder',
  'event_reminder',
  'pre_event_message',
  'post_event_followup',
  'no_show_recovery',
  'interested_followup',
  'next_step_proposal',
]);
export class LaunchActionPolicyService {
  static number(config: any, key: string, fallback: number, min = 0) {
    const value = Number(config?.[key]);
    return Number.isFinite(value) ? Math.max(min, value) : fallback;
  }
  static list(config: any, key: string, fallback: number[]) {
    const raw = config?.[key];
    return [
      ...new Set(
        (Array.isArray(raw) ? raw : fallback)
          .map(Number)
          .filter(value => Number.isFinite(value) && value > 0)
      ),
    ].sort((a, b) => b - a);
  }
  static maxAttempts(launch: any) {
    return Math.min(
      10,
      Math.max(
        1,
        this.number(launch.followUpConfig, 'maxAttempts', FollowUpPolicyService.maxAttempts(), 1)
      )
    );
  }
  static ttlMs(launch: any) {
    return this.number(launch.followUpConfig, 'proposalTtlMs', 86400000, 3600000);
  }
  static postDelayMs(launch: any) {
    return this.number(launch.followUpConfig, 'postEventDelayMinutes', 60) * 60000;
  }
}

export class LaunchActionService {
  private static snapshot(participant: any) {
    return {
      lifecycleVersion: participant.lifecycleVersion,
      stage: participant.stage.status,
      invitation: participant.invitation.status,
      registration: participant.registration.status,
      confirmation: participant.confirmation.status,
      attendance: participant.attendance.status,
      outcome: participant.outcome.status,
    };
  }
  private static async audit(userId: string, data: any) {
    try {
      return await LaunchEvent.create({ userId, ...data });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      return LaunchEvent.findOne({ userId, idempotencyKey: data.idempotencyKey });
    }
  }
  private static async ensure(
    launch: any,
    participant: any,
    kind: Kind,
    dueAt: Date,
    reason: string,
    suffix: string,
    now: Date,
    metadata: any = {}
  ) {
    const key = `${launch._id}:${participant._id}:${kind}:${suffix}`;
    if (await LaunchAction.exists({ userId: launch.userId, idempotencyKey: key })) return;
    const maxAttempts = LaunchActionPolicyService.maxAttempts(launch);
    const attempts = await LaunchAction.countDocuments({
      userId: launch.userId,
      launchId: launch._id,
      participantId: participant._id,
      kind,
      status: { $in: ['completed', 'failed', 'cancelled', 'skipped'] },
    });
    const latest: any = await LaunchAction.findOne({
      userId: launch.userId,
      participantId: participant._id,
      status: 'completed',
    })
      .sort({ completedAt: -1 })
      .select('completedAt');
    const cooldownUntil = latest?.completedAt
      ? new Date(new Date(latest.completedAt).getTime() + FollowUpPolicyService.cooldownMs())
      : null;
    if (cooldownUntil && cooldownUntil > dueAt) dueAt = cooldownUntil;
    const expiresAt =
      kind === 'event_reminder' || kind === 'pre_event_message'
        ? launch.eventStartsAt
        : launch.closesAt || new Date(dueAt.getTime() + LaunchActionPolicyService.ttlMs(launch));
    const status = attempts >= maxAttempts ? 'skipped' : 'pending';
    const conversation: any = await Conversation.findOne({
      userId: launch.userId,
      leadId: participant.leadId,
    })
      .sort({ lastMessage: -1 })
      .select('_id lastMessage');
    const action: any = await LaunchAction.findOneAndUpdate(
      { userId: launch.userId, idempotencyKey: key },
      {
        $setOnInsert: {
          userId: launch.userId,
          launchId: launch._id,
          participantId: participant._id,
          leadId: participant.leadId,
          conversationId: conversation?._id,
          kind,
          status,
          idempotencyKey: key,
          triggerType: metadata.triggerType || reason,
          triggerEventId: metadata.triggerEventId,
          dueAt,
          expiresAt,
          priority: metadata.priority || 'medium',
          reason: status === 'skipped' ? 'max_attempts_reached' : reason,
          launchSnapshot: {
            status: launch.status,
            configurationVersion: launch.configurationVersion,
            eventStartsAt: launch.eventStartsAt,
            eventEndsAt: launch.eventEndsAt,
            closesAt: launch.closesAt,
            timezone: launch.timezone,
          },
          participantSnapshot: this.snapshot(participant),
          conversationLastMessageAt: conversation?.lastMessage,
          maxAttempts,
          metadata,
        },
      },
      { upsert: true, new: true }
    );
    await this.audit(launch.userId.toString(), {
      launchId: launch._id,
      participantId: participant._id,
      leadId: participant.leadId,
      eventType: status === 'skipped' ? 'launch.action_skipped' : 'launch.action_created',
      idempotencyKey: `event:${key}`,
      source: 'launch_action_worker',
      actor: 'system',
      currentState: { actionId: action._id, kind, status },
      metadata: { reason: action.reason, dueAt },
    });
  }

  static async materialize(now = new Date()) {
    const launches: any[] = await Launch.find({
      status: { $in: ['scheduled', 'prelaunch', 'live', 'followup'] },
    });
    for (const launch of launches) {
      const participants: any[] = await LaunchParticipant.find({
        userId: launch.userId,
        launchId: launch._id,
        'stage.status': { $nin: ['discarded', 'opted_out'] },
      });
      for (const participant of participants) {
        const joined = new Date(participant.joinedAt || participant.createdAt);
        if (
          ['scheduled', 'prelaunch'].includes(launch.status) &&
          (!launch.eventStartsAt || new Date(launch.eventStartsAt) > now) &&
          ['selected', 'interested'].includes(participant.stage.status) &&
          participant.invitation.status === 'not_invited' &&
          participant.outcome.status !== 'meeting_requested'
        )
          await this.ensure(
            launch,
            participant,
            'invitation',
            now,
            'participant_selected',
            `selection:${participant.lifecycleVersion}`,
            now,
            { triggerType: 'participant_selected' }
          );
        if (
          participant.invitation.status === 'invited' &&
          !['registered', 'cancelled'].includes(participant.registration.status)
        )
          for (const hours of LaunchActionPolicyService.list(
            launch.followUpConfig,
            'registrationReminderHours',
            [24, 72]
          )) {
            const base = participant.invitation.changedAt || joined;
            await this.ensure(
              launch,
              participant,
              'registration_reminder',
              new Date(new Date(base).getTime() + hours * 3600000),
              'invited_not_registered',
              `registration:${new Date(base).toISOString()}:${hours}`,
              now,
              { windowHours: hours, triggerType: 'participant_invited' }
            );
          }
        if (
          (launch.eventStartsAt &&
            ['registered', 'confirmed'].includes(participant.registration.status)) ||
          (launch.eventStartsAt && participant.confirmation.status === 'confirmed')
        ) {
          for (const minutes of LaunchActionPolicyService.list(
            launch.followUpConfig,
            'eventReminderWindowsMinutes',
            [1440, 60]
          ))
            await this.ensure(
              launch,
              participant,
              'event_reminder',
              new Date(new Date(launch.eventStartsAt).getTime() - minutes * 60000),
              'event_upcoming',
              `event:${new Date(launch.eventStartsAt).toISOString()}:${minutes}`,
              now,
              { windowMinutes: minutes, triggerType: 'event_upcoming' }
            );
          const preMinutes = LaunchActionPolicyService.number(
            launch.followUpConfig,
            'preEventMessageMinutes',
            180
          );
          await this.ensure(
            launch,
            participant,
            'pre_event_message',
            new Date(new Date(launch.eventStartsAt).getTime() - preMinutes * 60000),
            'event_upcoming',
            `pre:${new Date(launch.eventStartsAt).toISOString()}:${preMinutes}`,
            now,
            { windowMinutes: preMinutes, triggerType: 'event_upcoming' }
          );
        }
        const eventEnd = launch.eventEndsAt || launch.eventStartsAt;
        if (eventEnd && new Date(eventEnd) <= now) {
          const due = new Date(
            new Date(eventEnd).getTime() + LaunchActionPolicyService.postDelayMs(launch)
          );
          if (participant.attendance.status === 'attended')
            await this.ensure(
              launch,
              participant,
              'post_event_followup',
              due,
              'attendance_attended',
              `attended:${participant.attendance.changedAt?.toISOString?.() || participant.lifecycleVersion}`,
              now,
              { triggerType: 'participant_attended' }
            );
          else if (participant.attendance.status === 'no_show')
            await this.ensure(
              launch,
              participant,
              'no_show_recovery',
              due,
              'attendance_no_show',
              `no-show:${participant.attendance.changedAt?.toISOString?.() || participant.lifecycleVersion}`,
              now,
              { triggerType: 'participant_not_attended' }
            );
          else
            await this.ensure(
              launch,
              participant,
              'post_event_followup',
              due,
              'attendance_unknown_requires_review',
              `unknown:${participant.lifecycleVersion}`,
              now,
              { taskOnly: true, triggerType: 'attendance_unknown' }
            );
        }
        if (
          participant.stage.status === 'interested' &&
          participant.invitation.status === 'invited'
        )
          await this.ensure(
            launch,
            participant,
            'interested_followup',
            new Date(joined.getTime() + LaunchActionPolicyService.postDelayMs(launch)),
            'participant_interested',
            `interest:${participant.stage.changedAt?.toISOString?.() || participant.lifecycleVersion}`,
            now,
            { triggerType: 'participant_interested' }
          );
        if (['information_requested', 'meeting_requested'].includes(participant.outcome.status))
          await this.ensure(
            launch,
            participant,
            'next_step_proposal',
            now,
            participant.outcome.status,
            `outcome:${participant.outcome.changedAt?.toISOString?.() || participant.lifecycleVersion}`,
            now,
            {
              taskOnly: participant.outcome.status === 'meeting_requested',
              triggerType: participant.outcome.status,
            }
          );
      }
    }
    await this.reconcile(now);
  }

  static async process(limit = 30, now = new Date()) {
    await this.materialize(now);
    let processed = 0;
    while (processed < limit) {
      const stale = new Date(now.getTime() - 300000);
      const action: any = await LaunchAction.findOneAndUpdate(
        {
          $or: [
            { status: 'pending', dueAt: { $lte: now } },
            { status: 'processing', lockedAt: { $lte: stale } },
          ],
        },
        { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } },
        { new: true, sort: { dueAt: 1 } }
      );
      if (!action) break;
      try {
        await this.execute(action, now);
      } catch (error) {
        const message =
          error instanceof Error ? error.message.slice(0, 500) : 'launch_action_failed';
        await LaunchAction.updateOne(
          { _id: action._id },
          action.attempts >= action.maxAttempts
            ? { $set: { status: 'failed', lastError: message } }
            : {
                $set: {
                  status: 'pending',
                  dueAt: new Date(now.getTime() + 60000),
                  lastError: message,
                },
                $unset: { lockedAt: 1 },
              }
        );
      }
      processed++;
    }
    return processed;
  }

  static async validateAction(action: any, now = new Date()) {
    const [launch, participant, lead, conversation]: any[] = await Promise.all([
      Launch.findOne({ _id: action.launchId, userId: action.userId }),
      LaunchParticipant.findOne({ _id: action.participantId, userId: action.userId }),
      Lead.findOne({ _id: action.leadId, userId: action.userId }),
      action.conversationId
        ? Conversation.findOne({ _id: action.conversationId, userId: action.userId })
        : null,
    ]);
    if (!launch || !participant || !lead) return { valid: false, reason: 'context_missing' };
    if (['cancelled', 'completed'].includes(launch.status))
      return { valid: false, reason: 'launch_terminal' };
    if (action.expiresAt && new Date(action.expiresAt) <= now)
      return { valid: false, reason: 'action_expired' };
    if (
      launch.configurationVersion !== action.launchSnapshot.configurationVersion ||
      new Date(launch.eventStartsAt || 0).getTime() !==
        new Date(action.launchSnapshot.eventStartsAt || 0).getTime()
    )
      return { valid: false, reason: 'launch_changed' };
    const expected = action.participantSnapshot;
    const current = this.snapshot(participant);
    for (const key of [
      'stage',
      'invitation',
      'registration',
      'confirmation',
      'attendance',
      'outcome',
    ] as const)
      if (expected[key] !== current[key])
        return { valid: false, reason: `participant_${key}_changed` };
    if (
      conversation &&
      new Date(conversation.lastMessage || 0).getTime() !==
        new Date(action.conversationLastMessageAt || 0).getTime()
    )
      return { valid: false, reason: 'conversation_changed' };
    if (FollowUpPolicyService.isOptOut(lead, conversation || { messages: [] }))
      return { valid: false, reason: 'opt_out_or_rejected' };
    if (conversation && ['closed'].includes(conversation.status))
      return { valid: false, reason: 'conversation_closed' };
    const activeMeeting = await Meeting.exists({
      userId: action.userId,
      leadId: action.leadId,
      status: { $in: ['confirmed', 'scheduled', 'pending_configuration'] },
      $or: [
        { scheduledFor: { $gt: now } },
        { scheduledAt: { $gt: now } },
        { status: 'pending_configuration' },
      ],
    });
    if (activeMeeting) return { valid: false, reason: 'active_meeting' };
    return { valid: true, launch, participant, lead, conversation };
  }
  static async validateProposal(proposal: any, now = new Date()) {
    if (proposal.purpose !== 'launch_action') return { valid: true };
    const action: any = await LaunchAction.findOne({
      _id: proposal.contextSnapshot?.launchActionId,
      userId: proposal.userId,
    });
    if (!action || action.proposalId?.toString() !== proposal._id.toString())
      return { valid: false, reason: 'launch_action_missing_or_replaced' };
    if (proposal.expiresAt && new Date(proposal.expiresAt) <= now)
      return { valid: false, reason: 'proposal_expired' };
    const validation: any = await this.validateAction(action, now);
    if (!validation.valid) return validation;
    const platform = String(validation.lead.currentChannel || validation.lead.platform);
    if (platform !== proposal.platform || platform !== action.proposedChannel)
      return { valid: false, reason: 'channel_changed' };
    return { valid: true };
  }
  static async invalidateProposal(id: any, reason: string, now = new Date()) {
    await AssistedProposal.updateOne(
      { _id: id, purpose: 'launch_action', status: { $in: ['proposed', 'failed'] } },
      {
        $set: {
          status: 'cancelled',
          invalidatedAt: now,
          invalidationReason: reason,
          errorMessage: `Propuesta de lanzamiento caducada: ${reason}`,
        },
      }
    );
  }
  private static recipient(lead: any, platform: string) {
    if (platform === 'whatsapp' && lead.phone)
      return { type: 'whatsapp_user', externalId: lead.phone };
    if (platform === 'instagram' && lead.username)
      return { type: 'instagram_user', externalId: lead.username };
    if (platform === 'facebook' && lead.username)
      return { type: 'facebook_user', externalId: lead.username };
    return undefined;
  }
  private static async execute(action: any, now: Date) {
    const validation: any = await this.validateAction(action, now);
    if (!validation.valid) return this.cancel(action, validation.reason, now);
    const { launch, participant, lead, conversation } = validation;
    const platform = String(lead.currentChannel || lead.platform);
    const channel = await MultichannelIdentityService.proposalDecision(
      action.userId.toString(),
      lead._id,
      platform,
      `launch_${action.kind}`
    );
    const taskData: any = {
      leadId: lead._id,
      conversationId: conversation?._id,
      title: `Revisar acción de lanzamiento: ${action.kind}`,
      description: `Lanzamiento ${launch.name}. Motivo: ${action.reason}. Revisar antes de cualquier contacto.`,
      type: 'follow_up',
      status: 'pending',
      priority: action.priority,
      dueDate: now,
      metadata: {
        globalTaskKey: undefined,
        followUpPurpose: `launch:${launch._id}:${action.kind}`,
        launchId: launch._id.toString(),
        launchParticipantId: participant._id.toString(),
        launchActionId: action._id.toString(),
        suggestedOnly: true,
        autoSent: false,
        contactId: channel.contactId,
        channelDecision: channel.reason,
        origins: ['launch_action'],
      },
    };
    const task: any = await TaskService.upsertPendingFollowUp(action.userId.toString(), taskData);
    let proposal: any;
    const recipient = this.recipient(lead, platform);
    const last = conversation?.messages?.at(-1);
    const taskOnly =
      action.metadata?.taskOnly ||
      !conversation ||
      last?.sender === 'lead' ||
      !channel.allowed ||
      !recipient ||
      !['whatsapp', 'instagram', 'facebook'].includes(platform) ||
      !proposalKinds.has(action.kind);
    if (!taskOnly)
      proposal = await this.createProposal(
        action,
        launch,
        participant,
        lead,
        conversation,
        platform as any,
        recipient,
        now
      );
    await LaunchAction.updateOne(
      { _id: action._id, status: 'processing' },
      {
        $set: {
          status: 'completed',
          completedAt: now,
          taskId: task._id,
          proposalId: proposal?._id,
          proposedChannel: platform,
          recipient,
        },
        $unset: { lockedAt: 1 },
      }
    );
    await AutomationEngineService.emit({
      eventId: action.idempotencyKey,
      trigger: 'launch.action_due',
      userId: action.userId.toString(),
      leadId: lead._id.toString(),
      conversationId: conversation?._id.toString(),
      platform: ['youtube', 'whatsapp', 'instagram', 'facebook', 'tiktok'].includes(platform)
        ? (platform as any)
        : undefined,
      data: {
        launchId: launch._id.toString(),
        participantId: participant._id.toString(),
        actionId: action._id.toString(),
        actionKind: action.kind,
        reason: action.reason,
      },
    });
    await this.audit(action.userId.toString(), {
      launchId: launch._id,
      participantId: participant._id,
      leadId: lead._id,
      eventType: proposal
        ? 'launch.action_task_and_proposal_generated'
        : 'launch.action_task_generated',
      idempotencyKey: `materialized:${action.idempotencyKey}`,
      source: 'launch_action_worker',
      actor: 'system',
      currentState: { actionId: action._id, status: 'completed' },
      metadata: {
        taskId: task._id,
        proposalId: proposal?._id,
        channelReason: channel.reason,
        autoSent: false,
      },
    });
  }
  private static async createProposal(
    action: any,
    launch: any,
    participant: any,
    lead: any,
    conversation: any,
    platform: 'whatsapp' | 'instagram' | 'facebook',
    recipient: any,
    now: Date
  ) {
    const history = (conversation.messages || [])
      .slice(-10)
      .filter((item: any) => ['lead', 'ai'].includes(item.sender))
      .map((item: any) => ({ sender: item.sender, text: String(item.text).slice(0, 1000) }));
    const commercial: any = await CommercialContextService.getActive(action.userId.toString());
    const configured = launch.followUpConfig?.messages?.[action.kind];
    const generated = configured
      ? { text: String(configured) }
      : await getAIProvider().generateReply({
          incomingText: `Acción asistida ${action.kind}. Lanzamiento: ${launch.name}. Objetivo: ${launch.objective || 'no especificado'}. Estado de participación: registro ${participant.registration.status}, confirmación ${participant.confirmation.status}, asistencia ${participant.attendance.status}. Motivo: ${action.reason}.`,
          isNewLead: false,
          intent: String(lead.qualification?.intent || 'interest'),
          normalizedIntent: String(lead.normalizedIntent || 'undetermined'),
          platform,
          history,
          askedTopics: conversation.aiAskedTopics || [],
          purpose: action.kind === 'no_show_recovery' ? 'reactivation' : 'follow_up',
          reactivationReason: action.reason,
          commercialContext: commercial
            ? {
                brandName: commercial.brandName,
                businessType: commercial.businessType,
                commercialLines: commercial.commercialLines,
                allowedInformation: commercial.allowedInformation,
                informationPendingConfirmation: commercial.informationPendingConfirmation,
                communicationRules: commercial.communicationRules,
                restrictions: commercial.restrictions,
                disclaimers: commercial.disclaimers,
              }
            : undefined,
        });
    const text = AlmaService.avoidRepeatedResponse(
      String(generated.text).slice(0, 1000),
      history,
      await ConversationService.getOrInitializeAIMemory(
        conversation._id.toString(),
        action.userId.toString()
      ),
      ''
    ).text.slice(0, 1000);
    const replaced: any[] = await AssistedProposal.find({
      userId: action.userId,
      leadId: lead._id,
      purpose: 'launch_action',
      status: { $in: ['proposed', 'failed'] },
      'contextSnapshot.launchId': launch._id.toString(),
      'contextSnapshot.launchActionId': { $ne: action._id.toString() },
    }).select('_id contextSnapshot.launchActionId');
    for (const old of replaced) {
      const oldAction: any = await LaunchAction.findOne({
        _id: old.contextSnapshot?.launchActionId,
        userId: action.userId,
      });
      if (oldAction) await this.cancel(oldAction, 'replaced_by_new_launch_action', now);
      else await this.invalidateProposal(old._id, 'replaced_by_new_launch_action', now);
    }
    await AssistedProposal.updateMany(
      { _id: { $in: replaced.map(item => item._id) }, status: { $in: ['proposed', 'failed'] } },
      {
        $set: {
          status: 'cancelled',
          invalidatedAt: now,
          invalidationReason: 'replaced_by_new_launch_action',
          errorMessage: 'Propuesta reemplazada por una acción más reciente',
        },
      }
    );
    const proposal: any = await AssistedProposal.findOneAndUpdate(
      { userId: action.userId, sourceEventId: action.idempotencyKey },
      {
        $setOnInsert: {
          userId: action.userId,
          leadId: lead._id,
          conversationId: conversation._id,
          sourceEventId: action.idempotencyKey,
          platform,
          recipient,
          text,
          originalText: text,
          purpose: 'launch_action',
          status: 'proposed',
          expiresAt: action.expiresAt,
          contextSnapshot: {
            leadStatus: lead.status,
            channel: platform,
            conversationLastMessageAt: conversation.lastMessage,
            launchId: launch._id.toString(),
            launchParticipantId: participant._id.toString(),
            launchActionId: action._id.toString(),
            launchStatus: launch.status,
            launchConfigurationVersion: launch.configurationVersion,
            launchEventStartsAt: launch.eventStartsAt,
            participantLifecycleVersion: participant.lifecycleVersion,
            participantStage: participant.stage.status,
            participantInvitation: participant.invitation.status,
            participantRegistration: participant.registration.status,
            participantConfirmation: participant.confirmation.status,
            participantAttendance: participant.attendance.status,
            participantOutcome: participant.outcome.status,
          },
        },
      },
      { upsert: true, new: true }
    );
    await LaunchAction.updateOne(
      { _id: action._id },
      { $set: { proposalId: proposal._id, proposedChannel: platform, recipient } }
    );
    return proposal;
  }
  static async reconcile(now = new Date()) {
    const actions: any[] = await LaunchAction.find({
      status: { $in: ['pending', 'processing', 'completed'] },
    }).limit(500);
    for (const action of actions) {
      const validation = await this.validateAction(action, now);
      if (!validation.valid) await this.cancel(action, validation.reason || 'context_changed', now);
    }
    const proposals: any[] = await AssistedProposal.find({
      purpose: 'launch_action',
      status: { $in: ['proposed', 'failed'] },
    }).limit(500);
    for (const proposal of proposals) {
      const validation = await this.validateProposal(proposal, now);
      if (!validation.valid)
        await this.invalidateProposal(proposal._id, validation.reason || 'context_changed', now);
    }
  }
  private static async cancel(action: any, reason: string, now: Date) {
    await LaunchAction.updateOne(
      { _id: action._id, status: { $in: ['pending', 'processing', 'completed'] } },
      {
        $set: { status: 'cancelled', invalidatedAt: now, invalidationReason: reason },
        $unset: { lockedAt: 1 },
      }
    );
    if (action.proposalId) await this.invalidateProposal(action.proposalId, reason, now);
    if (action.taskId)
      await Task.updateOne(
        { _id: action.taskId, status: 'pending' },
        { $set: { status: 'cancelled', 'metadata.cancelReason': reason } }
      );
    await this.audit(action.userId.toString(), {
      launchId: action.launchId,
      participantId: action.participantId,
      leadId: action.leadId,
      eventType:
        reason === 'replaced_by_new_launch_action'
          ? 'launch.action_replaced'
          : 'launch.action_expired',
      idempotencyKey: `cancelled:${action.idempotencyKey}:${reason}`,
      source: 'launch_action_worker',
      actor: 'system',
      currentState: { actionId: action._id, status: 'cancelled' },
      metadata: { reason },
    });
  }
}
