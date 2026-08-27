import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchEvent from '../models/LaunchEvent';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import ContactIdentity from '../models/ContactIdentity';
import ContactProfile from '../models/ContactProfile';
import CommercialContext from '../models/CommercialContext';
import type {
  AddLaunchParticipantInput,
  CreateLaunchInput,
  LaunchEvidenceInput,
  LaunchStatus,
  ParticipantDimension,
  ParticipantTransitionInput,
} from '../types/launch';
import { evidenceTypes, launchChannels, participantStates } from '../types/launch';
import { LaunchDomainError } from './LaunchDomainError';
import { LaunchSegmentContract } from './LaunchSegmentContract';

const launchTransitions: Record<LaunchStatus, LaunchStatus[]> = {
  draft: ['scheduled', 'cancelled'],
  scheduled: ['prelaunch', 'cancelled'],
  prelaunch: ['live', 'cancelled'],
  live: ['followup', 'cancelled'],
  followup: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};
const participantTransitions: Record<ParticipantDimension, Record<string, string[]>> = {
  stage: {
    selected: ['interested', 'discarded', 'opted_out'],
    interested: ['followup', 'discarded', 'opted_out'],
    followup: ['discarded', 'opted_out'],
    discarded: [],
    opted_out: [],
  },
  invitation: {
    not_invited: ['proposed', 'invited', 'declined'],
    proposed: ['invited', 'declined'],
    invited: ['declined'],
    declined: [],
  },
  registration: {
    unknown: ['pending', 'registered'],
    pending: ['registered', 'cancelled', 'unknown'],
    registered: ['cancelled', 'unknown'],
    cancelled: ['unknown'],
  },
  confirmation: {
    unknown: ['pending', 'confirmed', 'declined'],
    pending: ['confirmed', 'declined', 'unknown'],
    confirmed: ['declined', 'unknown'],
    declined: ['unknown'],
  },
  attendance: { unknown: ['attended', 'no_show'], attended: ['unknown'], no_show: ['unknown'] },
  outcome: {
    pending: ['information_requested', 'meeting_requested', 'converted', 'closed_lost'],
    information_requested: ['meeting_requested', 'converted', 'closed_lost'],
    meeting_requested: ['converted', 'closed_lost'],
    converted: [],
    closed_lost: [],
  },
};
const evidenceRequired: Partial<Record<ParticipantDimension, string[]>> = {
  invitation: ['invited', 'declined'],
  registration: ['registered', 'cancelled'],
  confirmation: ['confirmed', 'declined'],
  attendance: ['attended', 'no_show'],
  stage: ['discarded', 'opted_out'],
  outcome: ['converted', 'closed_lost'],
};

export class LaunchLifecycleService {
  static transitions = launchTransitions;

  private static timezoneValid(value: string): boolean {
    try {
      new Intl.DateTimeFormat('es', { timeZone: value }).format();
      return true;
    } catch {
      return false;
    }
  }
  private static cleanKey(value: string): string {
    const key = String(value || '').trim();
    if (!key || key.length > 300)
      throw new LaunchDomainError(
        'Se requiere una clave de idempotencia válida',
        'INVALID_IDEMPOTENCY_KEY'
      );
    return key;
  }
  private static normalizeEvidence(
    evidence: LaunchEvidenceInput | undefined,
    actor: string,
    required: boolean
  ): any {
    if (!evidence) {
      if (required)
        throw new LaunchDomainError(
          'La transición requiere evidencia explícita',
          'EVIDENCE_REQUIRED'
        );
      return undefined;
    }
    if (!evidenceTypes.includes(evidence.type))
      throw new LaunchDomainError('Tipo de evidencia no soportado', 'INVALID_EVIDENCE');
    const referenceId = evidence.referenceId?.trim();
    if (
      ['form', 'provider', 'webhook', 'import', 'external', 'system'].includes(evidence.type) &&
      !referenceId
    )
      throw new LaunchDomainError(
        'La evidencia externa requiere una referencia',
        'EVIDENCE_REFERENCE_REQUIRED'
      );
    const metadata = evidence.metadata || {};
    if (JSON.stringify(metadata).length > 4000)
      throw new LaunchDomainError(
        'Metadata de evidencia demasiado extensa',
        'INVALID_EVIDENCE_METADATA'
      );
    return {
      type: evidence.type,
      source: evidence.source?.trim().slice(0, 120) || evidence.type,
      channel: evidence.channel,
      referenceId,
      recordedBy: evidence.recordedBy?.trim() || actor,
      occurredAt: evidence.occurredAt || new Date(),
      note: evidence.note?.trim().slice(0, 500),
      metadata,
    };
  }
  private static validateDates(
    input: Pick<CreateLaunchInput, 'startsAt' | 'eventStartsAt' | 'eventEndsAt' | 'closesAt'>,
    requireSchedule = false
  ): void {
    if (requireSchedule && (!input.startsAt || !input.eventStartsAt || !input.closesAt))
      throw new LaunchDomainError(
        'El lanzamiento programado requiere inicio, evento y cierre',
        'DATES_REQUIRED'
      );
    const dates = [input.startsAt, input.eventStartsAt, input.eventEndsAt, input.closesAt].filter(
      Boolean
    ) as Date[];
    if (dates.some(value => Number.isNaN(new Date(value).getTime())))
      throw new LaunchDomainError('Una o más fechas no son válidas', 'INVALID_DATES');
    if (input.startsAt && input.eventStartsAt && input.startsAt > input.eventStartsAt)
      throw new LaunchDomainError(
        'El evento no puede iniciar antes del lanzamiento',
        'INVALID_DATE_ORDER'
      );
    if (input.eventStartsAt && input.eventEndsAt && input.eventStartsAt > input.eventEndsAt)
      throw new LaunchDomainError(
        'El evento no puede terminar antes de iniciar',
        'INVALID_DATE_ORDER'
      );
    const eventBoundary = input.eventEndsAt || input.eventStartsAt;
    if (eventBoundary && input.closesAt && eventBoundary > input.closesAt)
      throw new LaunchDomainError(
        'El cierre no puede ser anterior al evento',
        'INVALID_DATE_ORDER'
      );
  }
  private static async event(userId: string, data: Record<string, unknown>): Promise<any> {
    try {
      return await LaunchEvent.create({ userId, ...data });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const evidence: any = data.evidence;
      const existing = await LaunchEvent.findOne({
        userId,
        $or: [
          { idempotencyKey: data.idempotencyKey },
          ...(evidence?.referenceId
            ? [
                {
                  launchId: data.launchId,
                  eventType: data.eventType,
                  source: data.source,
                  'evidence.referenceId': evidence.referenceId,
                },
              ]
            : []),
        ],
      });
      if (!existing) throw error;
      return existing;
    }
  }

  static async createLaunch(userId: string, input: CreateLaunchInput): Promise<any> {
    const idempotencyKey = this.cleanKey(input.idempotencyKey);
    if (!this.timezoneValid(input.timezone))
      throw new LaunchDomainError('Timezone IANA inválido', 'INVALID_TIMEZONE');
    this.validateDates(input);
    const name = input.name?.trim();
    if (!name) throw new LaunchDomainError('El nombre es obligatorio', 'NAME_REQUIRED');
    const allowedChannels = [...new Set(input.allowedChannels || [])];
    if (allowedChannels.some(channel => !launchChannels.includes(channel)))
      throw new LaunchDomainError('Canal no soportado', 'INVALID_CHANNEL');
    const targetSegment =
      input.targetSegment && Object.keys(input.targetSegment).length
        ? LaunchSegmentContract.validate(input.targetSegment)
        : undefined;
    if (
      input.commercialContextId &&
      !(await CommercialContext.exists({ _id: input.commercialContextId, userId }))
    )
      throw new LaunchDomainError(
        'El contexto comercial no pertenece al propietario',
        'INVALID_COMMERCIAL_CONTEXT'
      );
    let launch: any;
    try {
      launch = await Launch.create({
        userId,
        name,
        description: input.description?.trim(),
        typeKey: input.typeKey?.trim() || 'generic',
        objective: input.objective?.trim(),
        timezone: input.timezone,
        startsAt: input.startsAt,
        eventStartsAt: input.eventStartsAt,
        eventEndsAt: input.eventEndsAt,
        closesAt: input.closesAt,
        targetSegment,
        selectionMode: input.selectionMode || 'manual',
        allowedChannels,
        registrationConfig: input.registrationConfig || {},
        followUpConfig: input.followUpConfig || {},
        metricsConfig: input.metricsConfig || {},
        commercialContextId: input.commercialContextId,
        metadata: input.metadata || {},
        creationKey: idempotencyKey,
        createdBy: input.actor,
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      launch = await Launch.findOne({ userId, creationKey: idempotencyKey });
      if (!launch) throw error;
    }
    await this.event(userId, {
      launchId: launch._id,
      eventType: 'launch.created',
      idempotencyKey: `launch-created:${idempotencyKey}`,
      source: 'domain',
      actor: input.actor,
      currentState: { status: launch.status },
      metadata: { typeKey: launch.typeKey },
    });
    return launch;
  }

  static async transitionLaunch(
    userId: string,
    launchId: string,
    target: LaunchStatus,
    idempotencyKeyInput: string,
    actor: string,
    reason?: string
  ): Promise<any> {
    const idempotencyKey = this.cleanKey(idempotencyKeyInput);
    const existingEvent: any = await LaunchEvent.findOne({ userId, idempotencyKey });
    if (existingEvent) return Launch.findOne({ _id: existingEvent.launchId, userId });
    const current: any = await Launch.findOne({ _id: launchId, userId });
    if (!current) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (current.status === target) return current;
    if (!launchTransitions[current.status as LaunchStatus]?.includes(target))
      throw new LaunchDomainError(
        `Transición inválida: ${current.status} → ${target}`,
        'INVALID_LAUNCH_TRANSITION'
      );
    if (target === 'scheduled') this.validateDates(current, true);
    const now = new Date();
    const set: any = { status: target, lastTransitionAt: now };
    if (target === 'cancelled') set.cancelledAt = now;
    if (target === 'completed') set.completedAt = now;
    const updated: any = await Launch.findOneAndUpdate(
      { _id: launchId, userId, status: current.status, lifecycleVersion: current.lifecycleVersion },
      { $set: set, $inc: { lifecycleVersion: 1 } },
      { new: true }
    );
    if (!updated) {
      const winner: any = await Launch.findOne({ _id: launchId, userId });
      if (winner?.status === target) return winner;
      throw new LaunchDomainError(
        'El lanzamiento cambió concurrentemente',
        'CONCURRENT_TRANSITION'
      );
    }
    await this.event(userId, {
      launchId: updated._id,
      eventType:
        target === 'cancelled'
          ? 'launch.cancelled'
          : target === 'completed'
            ? 'launch.completed'
            : 'launch.status_changed',
      idempotencyKey,
      source: 'domain',
      actor,
      previousState: { status: current.status },
      currentState: { status: target },
      metadata: { reason },
    });
    return updated;
  }

  static async updateLaunch(userId: string, launchId: string, input: any): Promise<any> {
    const idempotencyKey = this.cleanKey(input.idempotencyKey);
    const priorEvent: any = await LaunchEvent.findOne({ userId, idempotencyKey });
    if (priorEvent) return Launch.findOne({ _id: priorEvent.launchId, userId });
    const current: any = await Launch.findOne({ _id: launchId, userId });
    if (!current) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (['completed', 'cancelled'].includes(current.status))
      throw new LaunchDomainError('El lanzamiento está en estado terminal', 'LAUNCH_TERMINAL');
    const timezone = input.timezone ?? current.timezone;
    if (!this.timezoneValid(timezone))
      throw new LaunchDomainError('Timezone IANA inválido', 'INVALID_TIMEZONE');
    const dates: any = {
      startsAt:
        input.startsAt === undefined
          ? current.startsAt
          : input.startsAt
            ? new Date(input.startsAt)
            : undefined,
      eventStartsAt:
        input.eventStartsAt === undefined
          ? current.eventStartsAt
          : input.eventStartsAt
            ? new Date(input.eventStartsAt)
            : undefined,
      eventEndsAt:
        input.eventEndsAt === undefined
          ? current.eventEndsAt
          : input.eventEndsAt
            ? new Date(input.eventEndsAt)
            : undefined,
      closesAt:
        input.closesAt === undefined
          ? current.closesAt
          : input.closesAt
            ? new Date(input.closesAt)
            : undefined,
    };
    this.validateDates(dates, current.status !== 'draft');
    const allowedChannels =
      input.allowedChannels === undefined
        ? current.allowedChannels
        : [...new Set(input.allowedChannels)];
    if (allowedChannels.some((channel: any) => !launchChannels.includes(channel)))
      throw new LaunchDomainError('Canal no soportado', 'INVALID_CHANNEL');
    const set: any = { timezone, allowedChannels, ...dates };
    for (const field of [
      'name',
      'description',
      'typeKey',
      'objective',
      'selectionMode',
      'registrationConfig',
      'followUpConfig',
      'metricsConfig',
    ])
      if (input[field] !== undefined) set[field] = input[field];
    if (!String(set.name ?? current.name).trim())
      throw new LaunchDomainError('El nombre es obligatorio', 'NAME_REQUIRED');
    const updated = await Launch.findOneAndUpdate(
      { _id: launchId, userId, configurationVersion: current.configurationVersion },
      { $set: set, $inc: { configurationVersion: 1 } },
      { new: true, runValidators: true }
    );
    if (!updated)
      throw new LaunchDomainError(
        'El lanzamiento cambió concurrentemente',
        'CONCURRENT_TRANSITION'
      );
    await this.event(userId, {
      launchId: updated._id,
      eventType: 'launch.configuration_changed',
      idempotencyKey,
      source: 'crm',
      actor: input.actor,
      previousState: { configurationVersion: current.configurationVersion },
      currentState: { configurationVersion: updated.configurationVersion },
      metadata: { reason: input.reason },
    });
    return updated;
  }

  static async addParticipant(userId: string, input: AddLaunchParticipantInput): Promise<any> {
    const idempotencyKey = this.cleanKey(input.idempotencyKey);
    const priorEvent: any = await LaunchEvent.findOne({ userId, idempotencyKey });
    if (priorEvent?.participantId)
      return LaunchParticipant.findOne({ _id: priorEvent.participantId, userId });
    const [launch, lead]: any[] = await Promise.all([
      Launch.findOne({ _id: input.launchId, userId }),
      Lead.findOne({ _id: input.leadId, userId }),
    ]);
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (!lead) throw new LaunchDomainError('Lead no encontrado', 'LEAD_NOT_FOUND');
    if (['completed', 'cancelled'].includes(launch.status))
      throw new LaunchDomainError(
        'No se pueden añadir participantes a un lanzamiento terminal',
        'LAUNCH_TERMINAL'
      );
    if (
      lead.status === 'rejected' ||
      (lead.tags || []).some((tag: string) =>
        ['opt_out', 'do_not_contact', 'no_contactar'].includes(tag.toLowerCase())
      )
    )
      throw new LaunchDomainError(
        'El lead no admite participación por estado u opt-out',
        'PARTICIPANT_NOT_ALLOWED'
      );
    if (
      input.conversationId &&
      !(await Conversation.exists({ _id: input.conversationId, userId, leadId: lead._id }))
    )
      throw new LaunchDomainError(
        'La conversación no pertenece al lead y propietario',
        'INVALID_CONVERSATION'
      );
    const identity: any = await ContactIdentity.findOne({
      userId,
      leadId: lead._id,
      status: 'active',
    }).lean();
    let contactId: any;
    let participantKey = `lead:${lead._id}`;
    if (identity) {
      const contact: any = await ContactProfile.findOne({ _id: identity.contactId, userId }).lean();
      if (contact) {
        if (contact.generalOptOut || ['opted_out', 'blocked'].includes(identity.consentStatus))
          throw new LaunchDomainError(
            'El contacto no admite participación por opt-out',
            'PARTICIPANT_NOT_ALLOWED'
          );
        contactId = contact._id;
        participantKey = `contact:${contact._id}`;
      }
    }
    const evidence = this.normalizeEvidence(input.evidence, input.actor, false);
    if (contactId) {
      const confirmedIdentities: any[] = await ContactIdentity.find({
        userId,
        contactId,
        status: 'active',
      })
        .select('leadId')
        .lean();
      const confirmedParticipant: any = await LaunchParticipant.findOne({
        userId,
        launchId: launch._id,
        $or: [
          { participantKey },
          { leadId: { $in: confirmedIdentities.map(item => item.leadId) } },
        ],
      }).sort({ participantKey: 1 });
      if (confirmedParticipant) {
        await LaunchParticipant.updateOne(
          { _id: confirmedParticipant._id, userId, launchId: launch._id },
          { $set: { contactId, participantKey } }
        );
        await this.event(userId, {
          launchId: launch._id,
          participantId: confirmedParticipant._id,
          leadId: confirmedParticipant.leadId,
          eventType: 'launch.participant_added',
          idempotencyKey,
          source: input.source,
          actor: input.actor,
          evidence,
          currentState: { stage: confirmedParticipant.stage.status },
          metadata: { participantKey, deduplicatedByConfirmedContact: true },
        });
        return LaunchParticipant.findById(confirmedParticipant._id);
      }
    }
    let participant: any;
    try {
      participant = await LaunchParticipant.create({
        userId,
        launchId: launch._id,
        leadId: lead._id,
        contactId,
        conversationId: input.conversationId,
        participantKey,
        source: input.source,
        entryChannel: input.entryChannel || lead.currentChannel || lead.platform,
        joinedAt: new Date(),
        addedBy: input.actor,
        initialEvidence: evidence,
        metadata: input.metadata || {},
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      participant = await LaunchParticipant.findOne({
        userId,
        launchId: launch._id,
        $or: [{ participantKey }, { leadId: lead._id }],
      });
      if (!participant) throw error;
    }
    await this.event(userId, {
      launchId: launch._id,
      participantId: participant._id,
      leadId: participant.leadId,
      eventType: 'launch.participant_added',
      idempotencyKey,
      source: input.source,
      actor: input.actor,
      evidence,
      currentState: { stage: participant.stage.status },
      metadata: { participantKey },
    });
    return participant;
  }

  static async transitionParticipant(
    userId: string,
    input: ParticipantTransitionInput
  ): Promise<any> {
    const idempotencyKey = this.cleanKey(input.idempotencyKey);
    const priorEvent: any = await LaunchEvent.findOne({ userId, idempotencyKey });
    if (priorEvent?.participantId)
      return LaunchParticipant.findOne({ _id: priorEvent.participantId, userId });
    if (!Object.prototype.hasOwnProperty.call(participantStates, input.dimension))
      throw new LaunchDomainError(
        'Dimensión de participante inválida',
        'INVALID_PARTICIPANT_DIMENSION'
      );
    const participant: any = await LaunchParticipant.findOne({ _id: input.participantId, userId });
    if (!participant)
      throw new LaunchDomainError('Participante no encontrado', 'PARTICIPANT_NOT_FOUND');
    const launch: any = await Launch.findOne({ _id: participant.launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (launch.status === 'cancelled')
      throw new LaunchDomainError('El lanzamiento está cancelado', 'LAUNCH_TERMINAL');
    const current = participant[input.dimension]?.status;
    const target = String(input.status);
    if (current === target) return participant;
    if (
      !(participantStates[input.dimension] as readonly string[]).includes(target) ||
      !participantTransitions[input.dimension]?.[current]?.includes(target)
    )
      throw new LaunchDomainError(
        `Transición de participante inválida: ${input.dimension}.${current} → ${target}`,
        'INVALID_PARTICIPANT_TRANSITION'
      );
    const evidence = this.normalizeEvidence(
      input.evidence,
      input.actor,
      Boolean(evidenceRequired[input.dimension]?.includes(target))
    );
    const now = new Date();
    const updated: any = await LaunchParticipant.findOneAndUpdate(
      {
        _id: participant._id,
        userId,
        lifecycleVersion: participant.lifecycleVersion,
        [`${input.dimension}.status`]: current,
      },
      {
        $set: {
          [`${input.dimension}.status`]: target,
          [`${input.dimension}.changedAt`]: now,
          [`${input.dimension}.changedBy`]: input.actor,
          [`${input.dimension}.evidence`]: evidence,
          lastActivityAt: now,
        },
        $inc: { lifecycleVersion: 1 },
      },
      { new: true }
    );
    if (!updated) {
      const winner: any = await LaunchParticipant.findOne({ _id: participant._id, userId });
      if (winner?.[input.dimension]?.status === target) return winner;
      throw new LaunchDomainError(
        'El participante cambió concurrentemente',
        'CONCURRENT_TRANSITION'
      );
    }
    await this.event(userId, {
      launchId: updated.launchId,
      participantId: updated._id,
      leadId: updated.leadId,
      eventType: `launch.participant_${input.dimension}_changed`,
      idempotencyKey,
      source: evidence?.type || 'domain',
      actor: input.actor,
      evidence,
      previousState: { [input.dimension]: current },
      currentState: { [input.dimension]: target },
      metadata: { reason: input.reason },
    });
    return updated;
  }
}
