import crypto from 'crypto';
import Launch from '../models/Launch';
import LaunchSegmentVersion from '../models/LaunchSegmentVersion';
import LaunchEvent from '../models/LaunchEvent';
import LaunchParticipant from '../models/LaunchParticipant';
import Lead from '../models/Lead';
import Meeting from '../models/Meeting';
import QualificationHistory from '../models/QualificationHistory';
import ContactIdentity from '../models/ContactIdentity';
import ContactProfile from '../models/ContactProfile';
import DuplicateCandidate from '../models/DuplicateCandidate';
import { LaunchSegmentContract } from './LaunchSegmentContract';
import { LaunchDomainError } from './LaunchDomainError';
import { LaunchLifecycleService } from './LaunchLifecycleService';
import type { SegmentGroup, SegmentRule, TargetSegmentDefinition } from '../types/launch';

type Reason = {
  ruleId: string;
  code: string;
  field: string;
  matched: boolean;
  actual?: unknown;
  expected?: unknown;
  safety?: boolean;
};
type EvalContext = {
  activeMeetings: Set<string>;
  histories: Map<string, string[]>;
  identities: Map<string, any>;
  contacts: Map<string, any>;
  previous: Set<string>;
  duplicateWarnings: Map<string, string[]>;
  now: Date;
};

export class LaunchSegmentationService {
  private static hash(value: unknown) {
    return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }
  private static count(definition: TargetSegmentDefinition) {
    let rules = 0,
      groups = 0;
    const visit = (group: any) => {
      rules += group.rules.length;
      for (const child of group.groups || []) {
        groups++;
        visit(child);
      }
    };
    visit(definition);
    return { rules, groups };
  }
  private static async audit(userId: string, data: any) {
    try {
      return await LaunchEvent.create({ userId, ...data });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      return LaunchEvent.findOne({ userId, idempotencyKey: data.idempotencyKey });
    }
  }

  static validate(definition: unknown) {
    return LaunchSegmentContract.validate(definition);
  }

  static async save(
    userId: string,
    launchId: string,
    definitionInput: unknown,
    actor: string,
    reason?: string
  ): Promise<any> {
    const definition = this.validate(definitionInput);
    const definitionHash = this.hash(definition);
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    if (['completed', 'cancelled'].includes(launch.status))
      throw new LaunchDomainError('El lanzamiento es terminal', 'LAUNCH_TERMINAL');
    const same: any = await LaunchSegmentVersion.findOne({ userId, launchId, definitionHash });
    if (same) return same;
    const version = Number(launch.targetSegmentVersion || 0) + 1;
    const counts = this.count(definition);
    let snapshot: any;
    try {
      snapshot = await LaunchSegmentVersion.create({
        userId,
        launchId,
        version,
        schemaVersion: 1,
        definition,
        definitionHash,
        createdBy: actor,
        reason: reason?.slice(0, 500),
        summary: {
          logic: definition.logic,
          rules: definition.rules,
          ruleCount: counts.rules,
          groupCount: counts.groups,
        },
      });
    } catch (error: any) {
      if (error?.code !== 11000) throw error;
      const winner: any = await LaunchSegmentVersion.findOne({ userId, launchId, version });
      if (winner?.definitionHash === definitionHash) return winner;
      throw new LaunchDomainError(
        'El segmento cambió concurrentemente; recarga antes de guardar',
        'CONCURRENT_SEGMENT_UPDATE'
      );
    }
    const updated = await Launch.updateOne(
      { _id: launchId, userId, targetSegmentVersion: launch.targetSegmentVersion || 0 },
      {
        $set: { targetSegment: definition, targetSegmentVersion: version },
        $inc: { configurationVersion: 1 },
      }
    );
    if (!updated.modifiedCount) {
      await LaunchSegmentVersion.deleteOne({ _id: snapshot._id });
      throw new LaunchDomainError(
        'El segmento cambió concurrentemente; recarga antes de guardar',
        'CONCURRENT_SEGMENT_UPDATE'
      );
    }
    await this.audit(userId, {
      launchId,
      eventType: version === 1 ? 'launch.segment_created' : 'launch.segment_modified',
      idempotencyKey: `launch-segment:${launchId}:${version}`,
      source: 'segment_configuration',
      actor,
      currentState: { segmentVersion: version },
      metadata: { definitionHash, reason, ...counts },
    });
    return snapshot;
  }

  private static value(lead: any, field: string, context: EvalContext): unknown {
    const intents = [
      ...new Set(
        [
          lead.normalizedIntent,
          ...(lead.normalizedIntents || []),
          ...(lead.qualification?.normalizedIntents || []),
          ...(context.histories.get(lead._id.toString()) || []),
        ].filter(Boolean)
      ),
    ];
    const tags = (lead.tags || []).map((tag: string) => tag.toLowerCase());
    const latest = [lead.lastContact, lead.messageHistory?.at(-1)?.timestamp]
      .filter(Boolean)
      .map((date: any) => new Date(date).getTime())
      .sort((a: number, b: number) => b - a)[0];
    const days = latest ? Math.floor((context.now.getTime() - latest) / 86400000) : undefined;
    switch (field) {
      case 'score':
        return lead.score;
      case 'interest_level':
        return lead.interestLevel;
      case 'status':
        return lead.status;
      case 'normalized_intent':
        return lead.normalizedIntent;
      case 'intent_history':
        return intents;
      case 'tags':
        return tags;
      case 'product_interest':
        return (
          intents.some(item =>
            ['product_interest', 'product_sales', 'business_and_product_interest'].includes(item)
          ) ||
          tags.some((tag: string) =>
            [
              'interes_productos',
              'interes_venta_productos',
              'interes_negocio_y_productos',
            ].includes(tag)
          )
        );
      case 'business_interest':
        return (
          intents.some(item =>
            ['business_interest', 'business_opportunity', 'business_and_product_interest'].includes(
              item
            )
          ) ||
          tags.some((tag: string) =>
            ['interes_negocio', 'interes_oportunidad', 'interes_negocio_y_productos'].includes(tag)
          )
        );
      case 'income_need':
        return intents.includes('additional_income') || tags.includes('ingresos_adicionales');
      case 'commercial_experience':
        return (
          tags.some((tag: string) => ['experiencia_comercial', 'ventas'].includes(tag)) ||
          Boolean(lead.qualification?.conversationalSignals?.commercialExperience)
        );
      case 'commercial_affinity':
        return (
          tags.includes('afinidad_comercial') ||
          Boolean(lead.qualification?.conversationalSignals?.commercialAffinity)
        );
      case 'origin':
        return lead.origin?.source || lead.source;
      case 'channel':
        return lead.currentChannel || lead.platform;
      case 'recent_activity_days':
      case 'last_contact_days':
        return days;
      case 'active_meeting':
        return context.activeMeetings.has(lead._id.toString());
      case 'previous_participation':
        return context.previous.has(lead._id.toString());
      default:
        return undefined;
    }
  }
  private static match(actual: any, rule: SegmentRule): boolean {
    const expected: any = rule.value;
    switch (rule.operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'in':
        return (
          Array.isArray(expected) &&
          (Array.isArray(actual)
            ? actual.some(value => expected.includes(value))
            : expected.includes(actual))
        );
      case 'contains':
        return Array.isArray(actual)
          ? actual.includes(expected)
          : String(actual ?? '')
              .toLowerCase()
              .includes(String(expected ?? '').toLowerCase());
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'exists':
        return expected
          ? actual !== undefined && actual !== null
          : actual === undefined || actual === null;
      default:
        return false;
    }
  }
  private static group(
    lead: any,
    group: SegmentGroup | TargetSegmentDefinition,
    context: EvalContext,
    reasons: Reason[]
  ): boolean {
    const matches = group.rules.map(rule => {
      const actual = this.value(lead, rule.field, context);
      const matched = this.match(actual, rule);
      reasons.push({
        ruleId: rule.id,
        code: matched
          ? 'criterion_matched'
          : actual == null
            ? 'missing_evidence'
            : 'criterion_not_matched',
        field: rule.field,
        matched,
        actual,
        expected: rule.value,
      });
      return matched;
    });
    const nested = (group.groups || []).map(child => this.group(lead, child, context, reasons));
    const all = [...matches, ...nested];
    return group.logic === 'AND' ? all.every(Boolean) : all.some(Boolean);
  }
  private static safety(launch: any, lead: any, context: EvalContext): Reason[] {
    const reasons: Reason[] = [];
    const leadId = lead._id.toString(),
      identity = context.identities.get(leadId),
      contact = identity ? context.contacts.get(identity.contactId.toString()) : null,
      channel = lead.currentChannel || lead.platform;
    if (lead.status === 'rejected')
      reasons.push({
        ruleId: 'safety:terminal',
        code: 'terminal_status',
        field: 'status',
        matched: false,
        actual: lead.status,
        safety: true,
      });
    if (
      (lead.tags || []).some((tag: string) =>
        ['opt_out', 'do_not_contact', 'no_contactar'].includes(tag.toLowerCase())
      ) ||
      contact?.generalOptOut
    )
      reasons.push({
        ruleId: 'safety:optout',
        code: 'general_opt_out',
        field: 'opt_out',
        matched: false,
        safety: true,
      });
    if (identity && ['opted_out', 'blocked'].includes(identity.consentStatus))
      reasons.push({
        ruleId: 'safety:channel',
        code: 'channel_not_allowed',
        field: 'channel',
        matched: false,
        actual: channel,
        safety: true,
      });
    if (launch.allowedChannels?.length && !launch.allowedChannels.includes(channel))
      reasons.push({
        ruleId: 'safety:launch_channel',
        code: 'launch_channel_not_allowed',
        field: 'channel',
        matched: false,
        actual: channel,
        safety: true,
      });
    if (context.activeMeetings.has(leadId))
      reasons.push({
        ruleId: 'safety:meeting',
        code: 'active_meeting',
        field: 'active_meeting',
        matched: false,
        actual: true,
        safety: true,
      });
    return reasons;
  }

  private static async context(
    userId: string,
    launchId: string,
    leads: any[],
    now: Date
  ): Promise<EvalContext> {
    const leadIds = leads.map(item => item._id);
    const [meetings, histories, identities, previous, duplicates]: any[] = await Promise.all([
      Meeting.find({
        userId,
        leadId: { $in: leadIds },
        status: { $in: ['confirmed', 'scheduled', 'pending_configuration'] },
        $or: [
          { scheduledFor: { $gt: now } },
          { scheduledAt: { $gt: now } },
          { status: 'pending_configuration' },
        ],
      })
        .select('leadId')
        .lean(),
      QualificationHistory.find({ userId, leadId: { $in: leadIds } })
        .select('leadId current.normalizedIntent')
        .lean(),
      ContactIdentity.find({ userId, leadId: { $in: leadIds }, status: 'active' }).lean(),
      LaunchParticipant.find({ userId, launchId: { $ne: launchId }, leadId: { $in: leadIds } })
        .select('leadId')
        .lean(),
      DuplicateCandidate.find({
        userId,
        status: 'pending',
        $or: [{ leadAId: { $in: leadIds } }, { leadBId: { $in: leadIds } }],
      }).lean(),
    ]);
    const contacts: any[] = await ContactProfile.find({
      userId,
      _id: { $in: identities.map((item: any) => item.contactId) },
    }).lean();
    const historyMap = new Map<string, string[]>();
    for (const item of histories) {
      const key = item.leadId.toString();
      historyMap.set(
        key,
        [...(historyMap.get(key) || []), item.current?.normalizedIntent].filter(Boolean)
      );
    }
    const warningMap = new Map<string, string[]>();
    for (const item of duplicates)
      for (const id of [item.leadAId.toString(), item.leadBId.toString()])
        warningMap.set(id, [...(warningMap.get(id) || []), item._id.toString()]);
    return {
      activeMeetings: new Set(meetings.map((item: any) => item.leadId.toString())),
      histories: historyMap,
      identities: new Map(identities.map((item: any) => [item.leadId.toString(), item])),
      contacts: new Map(contacts.map((item: any) => [item._id.toString(), item])),
      previous: new Set(previous.map((item: any) => item.leadId.toString())),
      duplicateWarnings: warningMap,
      now,
    };
  }

  static async evaluate(
    userId: string,
    launch: any,
    leads: any[],
    definition: TargetSegmentDefinition,
    now = new Date()
  ) {
    const context = await this.context(userId, launch._id.toString(), leads, now);
    return leads.map(lead => {
      const reasons: Reason[] = [];
      const criteriaMatched = this.group(lead, definition, context, reasons);
      const safetyReasons = this.safety(launch, lead, context);
      return {
        leadId: lead._id.toString(),
        eligible: criteriaMatched && !safetyReasons.length,
        criteriaMatched,
        reasons: [...safetyReasons, ...reasons],
        safetyBlocked: Boolean(safetyReasons.length),
        possibleDuplicateCandidateIds: context.duplicateWarnings.get(lead._id.toString()) || [],
        lead: {
          username: lead.username,
          fullName: lead.fullName,
          score: lead.score,
          interestLevel: lead.interestLevel,
          status: lead.status,
          channel: lead.currentChannel || lead.platform,
        },
      };
    });
  }

  static async preview(
    userId: string,
    launchId: string,
    options: {
      page?: number;
      limit?: number;
      version?: number;
      now?: Date;
      actor?: string;
      idempotencyKey?: string;
    } = {}
  ) {
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const version = options.version || launch.targetSegmentVersion;
    const snapshot: any = await LaunchSegmentVersion.findOne({ userId, launchId, version });
    if (!snapshot)
      throw new LaunchDomainError('Versión de segmento no encontrada', 'SEGMENT_VERSION_NOT_FOUND');
    const page = Math.max(1, Number(options.page || 1)),
      limit = Math.min(100, Math.max(1, Number(options.limit || 20)));
    const [totalAvailable, leads] = await Promise.all([
      Lead.countDocuments({ userId }),
      Lead.find({ userId })
        .sort({ createdAt: -1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);
    const results = await this.evaluate(userId, launch, leads, snapshot.definition, options.now);
    const distribution = (field: string) =>
      results.reduce((map: Record<string, number>, item: any) => {
        const key = String(item.lead[field] || 'unknown');
        map[key] = (map[key] || 0) + 1;
        return map;
      }, {});
    if (options.idempotencyKey)
      await this.audit(userId, {
        launchId,
        eventType: 'launch.segment_previewed',
        idempotencyKey: options.idempotencyKey,
        source: 'segment_preview',
        actor: options.actor || userId,
        currentState: { segmentVersion: version },
        metadata: {
          page,
          limit,
          evaluated: results.length,
          eligible: results.filter(item => item.eligible).length,
        },
      });
    return {
      launchId,
      segmentVersion: version,
      definitionHash: snapshot.definitionHash,
      evaluatedAt: options.now || new Date(),
      page,
      limit,
      totalAvailable,
      totalEvaluated: results.length,
      eligible: results.filter(item => item.eligible).length,
      notEligible: results.filter(item => !item.eligible).length,
      distributions: {
        temperature: distribution('interestLevel'),
        channel: distribution('channel'),
        status: distribution('status'),
      },
      results,
    };
  }

  static async confirmSelection(
    userId: string,
    launchId: string,
    input: {
      segmentVersion: number;
      decisions: Array<{ leadId: string; selected: boolean; overrideReason?: string }>;
      idempotencyKey: string;
      actor: string;
    }
  ) {
    const launch: any = await Launch.findOne({ _id: launchId, userId });
    const snapshot: any = await LaunchSegmentVersion.findOne({
      userId,
      launchId,
      version: input.segmentVersion,
    });
    if (!launch || !snapshot)
      throw new LaunchDomainError('Lanzamiento o segmento no encontrado', 'SEGMENT_NOT_FOUND');
    if (!Array.isArray(input.decisions) || input.decisions.length > 100)
      throw new LaunchDomainError('La selección admite máximo 100 decisiones', 'INVALID_SELECTION');
    const ids = [...new Set(input.decisions.map(item => item.leadId))];
    const leads: any[] = await Lead.find({ userId, _id: { $in: ids } }).lean();
    if (leads.length !== ids.length)
      throw new LaunchDomainError('Uno o más leads no pertenecen al propietario', 'LEAD_NOT_FOUND');
    const evaluations: any[] = await this.evaluate(userId, launch, leads, snapshot.definition);
    const byId = new Map(evaluations.map(item => [item.leadId, item]));
    const participants = [];
    for (const decision of input.decisions) {
      const evaluation: any = byId.get(decision.leadId);
      const decisionKey = `${input.idempotencyKey}:${decision.leadId}`;
      if (!decision.selected) {
        await this.audit(userId, {
          launchId,
          leadId: decision.leadId,
          eventType: 'launch.segment_selection_excluded',
          idempotencyKey: decisionKey,
          source: 'segment_selection',
          actor: input.actor,
          currentState: { selected: false },
          metadata: {
            segmentVersion: input.segmentVersion,
            reason: decision.overrideReason,
            reasons: evaluation.reasons,
          },
        });
        continue;
      }
      if (!evaluation.eligible) {
        if (evaluation.safetyBlocked)
          throw new LaunchDomainError(
            'No se puede omitir una exclusión de seguridad',
            'SAFETY_OVERRIDE_FORBIDDEN'
          );
        if (!decision.overrideReason?.trim())
          throw new LaunchDomainError('El override requiere motivo', 'OVERRIDE_REASON_REQUIRED');
      }
      const participant: any = await LaunchLifecycleService.addParticipant(userId, {
        launchId,
        leadId: decision.leadId,
        source: 'segment_selection',
        idempotencyKey: `participant:${decisionKey}`,
        actor: input.actor,
        metadata: {
          selection: {
            mode: evaluation.eligible ? 'segment' : 'manual_override',
            segmentVersion: input.segmentVersion,
            definitionHash: snapshot.definitionHash,
            evaluatedAt: new Date(),
            reasons: evaluation.reasons,
            overrideReason: decision.overrideReason,
          },
        },
      });
      participants.push(participant);
      await this.audit(userId, {
        launchId,
        participantId: participant._id,
        leadId: decision.leadId,
        eventType: evaluation.eligible
          ? 'launch.segment_selection_confirmed'
          : 'launch.segment_selection_overridden',
        idempotencyKey: decisionKey,
        source: 'segment_selection',
        actor: input.actor,
        currentState: { selected: true },
        metadata: {
          segmentVersion: input.segmentVersion,
          definitionHash: snapshot.definitionHash,
          reasons: evaluation.reasons,
          overrideReason: decision.overrideReason,
        },
      });
    }
    return { segmentVersion: input.segmentVersion, participants };
  }

  static async addManual(
    userId: string,
    launchId: string,
    input: {
      leadId: string;
      conversationId?: string;
      reason: string;
      idempotencyKey: string;
      actor: string;
    }
  ) {
    if (!input.reason?.trim())
      throw new LaunchDomainError('La selección manual requiere motivo', 'MANUAL_REASON_REQUIRED');
    const participant: any = await LaunchLifecycleService.addParticipant(userId, {
      launchId,
      leadId: input.leadId,
      conversationId: input.conversationId,
      source: 'manual_selection',
      idempotencyKey: `participant:${input.idempotencyKey}`,
      actor: input.actor,
      metadata: {
        selection: { mode: 'manual', reason: input.reason.trim(), selectedAt: new Date() },
      },
    });
    await this.audit(userId, {
      launchId,
      participantId: participant._id,
      leadId: input.leadId,
      eventType: 'launch.manual_selection_confirmed',
      idempotencyKey: input.idempotencyKey,
      source: 'manual_selection',
      actor: input.actor,
      currentState: { selected: true },
      metadata: { reason: input.reason.trim() },
    });
    return participant;
  }
}
