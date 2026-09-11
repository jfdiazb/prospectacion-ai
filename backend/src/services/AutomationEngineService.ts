import crypto from 'crypto';
import AutomationFlow from '../models/AutomationFlow';
import AutomationExecution from '../models/AutomationExecution';
import AutomationJob from '../models/AutomationJob';
import Lead from '../models/Lead';
import Conversation from '../models/Conversation';
import AssistedProposal from '../models/AssistedProposal';
import { TaskService } from './TaskService';
import { getAIProvider } from '../integrations/ai';
import { CommercialContextService } from './CommercialContextService';
import { FollowUpService } from './FollowUpService';
import { ReactivationService } from './ReactivationService';
import { MeetingAutomationService } from './MeetingAutomationService';
import { MultichannelIdentityService } from './MultichannelIdentityService';
import { LaunchActionService } from './LaunchActionService';

export type AutomationTrigger =
  | 'lead.created'
  | 'message.received'
  | 'keyword.detected'
  | 'lead.score_changed'
  | 'lead.status_changed'
  | 'lead.qualification_changed'
  | 'conversation.updated'
  | 'followup.due'
  | 'meeting.intent_detected'
  | 'meeting.requested'
  | 'meeting.confirmed'
  | 'meeting.failed'
  | 'meeting.completed'
  | 'meeting.reminder_due'
  | 'meeting.no_show'
  | 'meeting.followup_due'
  | 'launch.action_due';
export type AutomationEvent = {
  eventId: string;
  trigger: AutomationTrigger;
  userId: string;
  leadId?: string;
  conversationId?: string;
  platform?: 'youtube' | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok';
  source?: string;
  text?: string;
  occurredAt?: string;
  recipient?: { type: string; externalId: string };
  data?: Record<string, unknown>;
};

const allowedFields = new Set([
  'leadId',
  'platform',
  'source',
  'keyword',
  'score',
  'interestLevel',
  'status',
  'tags',
  'intent',
  'normalizedIntent',
  'normalizedIntents',
  'commercialContextId',
  'meetingIntent',
  'lastInteractionAt',
  'targetProfile',
  'affinities',
]);
const valueAt = (event: AutomationEvent, field: string) =>
  field in event ? (event as any)[field] : event.data?.[field];

export class AutomationEngineService {
  static async emitLeadLifecycleEvents(
    event: Omit<AutomationEvent, 'trigger'>,
    previous: {
      score?: number;
      status?: string;
      interestLevel?: string;
      normalizedIntent?: string;
    } | null,
    current: { score?: number; status?: string; interestLevel?: string; normalizedIntent?: string }
  ): Promise<void> {
    const lifecycle = [
      ...(!previous ? [{ trigger: 'lead.created' as const, suffix: 'lead-created' }] : []),
      ...(previous?.score !== current.score
        ? [{ trigger: 'lead.score_changed' as const, suffix: 'score-changed' }]
        : []),
      ...(previous?.status !== current.status
        ? [{ trigger: 'lead.status_changed' as const, suffix: 'status-changed' }]
        : []),
      ...(previous?.score !== current.score ||
      previous?.status !== current.status ||
      previous?.interestLevel !== current.interestLevel ||
      previous?.normalizedIntent !== current.normalizedIntent
        ? [{ trigger: 'lead.qualification_changed' as const, suffix: 'qualification-changed' }]
        : []),
      { trigger: 'conversation.updated' as const, suffix: 'conversation-updated' },
    ];
    try {
      for (const item of lifecycle)
        await this.emit({
          ...event,
          eventId: `${event.eventId}:${item.suffix}`,
          trigger: item.trigger,
        });
    } catch (error) {
      console.error('Automation lifecycle dispatch failed', {
        platform: event.platform,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  static async emitMessageEvents(
    event: Omit<AutomationEvent, 'trigger'>,
    includeKeyword = true
  ): Promise<void> {
    try {
      await this.emit({ ...event, trigger: 'message.received' });
      if (includeKeyword && event.text?.trim())
        await this.emit({ ...event, trigger: 'keyword.detected' });
    } catch (error) {
      console.error('Automation event dispatch failed', {
        platform: event.platform,
        errorType: error instanceof Error ? error.name : 'unknown',
      });
    }
  }
  static conditionMatches(condition: any, event: AutomationEvent, now = Date.now()): boolean {
    if (!allowedFields.has(condition.field)) return false;
    const actual: any = valueAt(event, condition.field);
    const expected = condition.value;
    switch (condition.operator) {
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'contains':
        return Array.isArray(actual)
          ? actual.includes(expected)
          : String(actual ?? '')
              .toLocaleLowerCase('es')
              .includes(String(expected ?? '').toLocaleLowerCase('es'));
      case 'in':
        return Array.isArray(expected) && expected.includes(actual);
      case 'gte':
        return Number(actual) >= Number(expected);
      case 'lte':
        return Number(actual) <= Number(expected);
      case 'exists':
        return expected ? actual != null : actual == null;
      case 'elapsed_gte':
        return (
          Number.isFinite(new Date(actual).getTime()) &&
          now - new Date(actual).getTime() >= Number(expected)
        );
      default:
        return false;
    }
  }

  static conditionsMatch(flow: any, event: AutomationEvent): boolean {
    const conditions = flow.conditions ?? [];
    if (!conditions.length) return true;
    const results = conditions.map((item: any) => this.conditionMatches(item, event));
    return flow.conditionLogic === 'OR' ? results.some(Boolean) : results.every(Boolean);
  }

  static triggerMatches(flow: any, event: AutomationEvent): boolean {
    const type = flow.trigger?.type === 'keyword' ? 'keyword.detected' : flow.trigger?.type;
    if (
      type !== event.trigger ||
      (flow.trigger?.platform && flow.trigger.platform !== event.platform)
    )
      return false;
    if (type === 'keyword.detected') {
      const keywords = [...(flow.trigger.keywords ?? []), flow.trigger.keyword].filter(Boolean);
      return keywords.some((keyword: string) =>
        new RegExp(
          `(^|[^\\p{L}\\p{N}_])${keyword.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}([^\\p{L}\\p{N}_]|$)`,
          'iu'
        ).test(event.text ?? '')
      );
    }
    return true;
  }

  static async emit(event: AutomationEvent): Promise<any[]> {
    if (!event.eventId || !event.userId || !event.trigger)
      throw new Error('Evento de automatización inválido');
    const flows = await AutomationFlow.find({
      userId: event.userId,
      $or: [{ status: 'active' }, { status: { $exists: false }, isActive: true }],
    }).sort({ createdAt: 1 });
    const results = [];
    for (const flow of flows)
      if (this.triggerMatches(flow, event) && this.conditionsMatch(flow, event))
        results.push(await this.start(flow, event));
    return results;
  }

  static async start(flow: any, event: AutomationEvent) {
    const idempotencyKey = crypto
      .createHash('sha256')
      .update(`${event.userId}:${flow._id}:${event.eventId}`)
      .digest('hex');
    const existing = await AutomationExecution.findOne({ idempotencyKey });
    if (existing) return existing;
    let execution: any;
    try {
      execution = await AutomationExecution.create({
        userId: event.userId,
        automationId: flow._id,
        leadId: event.leadId,
        conversationId: event.conversationId,
        eventId: event.eventId,
        idempotencyKey,
        trigger: event.trigger,
        platform: event.platform,
      });
    } catch (error: any) {
      if (error?.code === 11000) return AutomationExecution.findOne({ idempotencyKey });
      throw error;
    }
    await AutomationFlow.updateOne(
      { _id: flow._id, userId: event.userId },
      {
        $inc: { 'executionStats.totalExecutions': 1 },
        $set: { lastRunAt: new Date(), 'executionStats.lastExecution': new Date() },
      }
    );
    return this.run(flow, execution, event, 0);
  }

  static async run(
    flow: any,
    execution: any,
    event: AutomationEvent,
    startIndex: number
  ): Promise<any> {
    try {
      for (let index = startIndex; index < flow.actions.length; index++) {
        const action: any = flow.actions[index];
        const startedAt = new Date();
        if (event.leadId) {
          const current: any = await Lead.findOne({
            _id: event.leadId,
            userId: event.userId,
          }).lean();
          if (current)
            event.data = {
              ...(event.data ?? {}),
              score: current.score,
              interestLevel: current.interestLevel,
              status: current.status,
              tags: current.tags,
              intent: current.qualification?.intent,
              normalizedIntent: current.normalizedIntent ?? current.qualification?.normalizedIntent,
              normalizedIntents: current.normalizedIntents,
              commercialContextId: current.commercialContextId?.toString(),
              meetingIntent: current.qualification?.meetingIntent,
              lastInteractionAt: current.lastContact,
            };
        }
        if (
          action.conditions?.length &&
          !action.conditions.every((condition: any) => this.conditionMatches(condition, event))
        ) {
          await AutomationExecution.updateOne(
            { _id: execution._id },
            {
              $push: {
                steps: {
                  index,
                  type: action.type,
                  status: 'skipped',
                  startedAt,
                  finishedAt: new Date(),
                  result: { reason: 'conditions_false' },
                  attempts: 0,
                },
              },
            }
          );
          continue;
        }
        if (action.type === 'wait') {
          const durationMs = Math.min(
            30 * 86400000,
            Math.max(1, Number(action.config?.durationMs ?? action.delay ?? 0))
          );
          await AutomationJob.findOneAndUpdate(
            { executionId: execution._id },
            {
              $set: {
                userId: event.userId,
                automationId: flow._id,
                runAt: new Date(Date.now() + durationMs),
                resumeStep: index + 1,
                context: event,
                status: 'pending',
                attempts: 0,
              },
            },
            { upsert: true }
          );
          await AutomationExecution.updateOne(
            { _id: execution._id },
            {
              $set: { status: 'waiting' },
              $push: {
                steps: {
                  index,
                  type: action.type,
                  status: 'waiting',
                  startedAt,
                  finishedAt: new Date(),
                  result: { durationMs },
                  attempts: 1,
                },
              },
            }
          );
          return AutomationExecution.findById(execution._id);
        }
        let result: any;
        let attempts = 0;
        while (attempts < 3) {
          try {
            attempts++;
            result = await this.executeAction(action, event, flow, execution);
            break;
          } catch (error) {
            if (attempts >= 3) throw error;
          }
        }
        await AutomationExecution.updateOne(
          { _id: execution._id },
          {
            $push: {
              steps: {
                index,
                type: action.type,
                status: 'completed',
                startedAt,
                finishedAt: new Date(),
                result,
                attempts,
              },
            },
          }
        );
      }
      await Promise.all([
        AutomationExecution.updateOne(
          { _id: execution._id },
          {
            $set: {
              status: 'completed',
              finishedAt: new Date(),
              result: { completedSteps: flow.actions.length },
            },
          }
        ),
        AutomationFlow.updateOne(
          { _id: flow._id },
          { $inc: { 'executionStats.successfulExecutions': 1 } }
        ),
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message.slice(0, 500) : 'Error de automatización';
      await Promise.all([
        AutomationExecution.updateOne(
          { _id: execution._id },
          { $set: { status: 'failed', finishedAt: new Date(), error: message } }
        ),
        AutomationFlow.updateOne(
          { _id: flow._id },
          {
            $inc: { 'executionStats.failedExecutions': 1 },
            $set: { status: 'error', isActive: false },
          }
        ),
      ]);
    }
    return AutomationExecution.findById(execution._id);
  }

  static async executeAction(
    action: any,
    event: AutomationEvent,
    flow: any,
    execution: any
  ): Promise<any> {
    if (!event.leadId && action.type !== 'create_or_update_lead')
      throw new Error('La acción requiere leadId');
    const config = action.config ?? {};
    const leadFilter = { _id: event.leadId, userId: event.userId };
    if (action.type === 'add_tag') {
      await Lead.updateOne(leadFilter, { $addToSet: { tags: String(config.tag).slice(0, 50) } });
      return { tag: config.tag };
    }
    if (action.type === 'change_status') {
      await Lead.updateOne(leadFilter, { $set: { status: config.status } });
      return { status: config.status };
    }
    if (action.type === 'update_score') {
      const score = Math.max(0, Math.min(100, Number(config.score)));
      await Lead.updateOne(leadFilter, { $set: { score } });
      return { score };
    }
    if (action.type === 'mark_meeting_candidate') {
      await Lead.updateOne(leadFilter, {
        $set: { 'qualification.meetingRequested': true, 'qualification.meetingIntent': 'high' },
      });
      return { meetingIntent: 'high' };
    }
    if (action.type === 'add_note') {
      const note = String(config.note ?? '').slice(0, 1000);
      await Lead.updateOne(leadFilter, { $set: { notes: note } });
      return { note };
    }
    if (action.type === 'create_task' || action.type === 'suggest_followup') {
      const taskData = {
        leadId: event.leadId!,
        conversationId: event.conversationId,
        title: String(
          config.title ??
            (action.type === 'suggest_followup'
              ? 'Seguimiento sugerido'
              : 'Tarea de automatización')
        ).slice(0, 120),
        description: String(config.description ?? `Generada por ${flow.name}`).slice(0, 500),
        type: 'follow_up' as const,
        status: 'pending' as const,
        priority: config.priority ?? 'medium',
        dueDate: new Date(Date.now() + Number(config.delayMs ?? 86400000)),
        metadata: {
          automationId: flow._id.toString(),
          executionId: execution._id.toString(),
          suggestedOnly: action.type === 'suggest_followup',
          followUpPurpose: String(config.followUpPurpose ?? 'assisted_conversation_review').slice(
            0,
            80
          ),
          sourceEventId: event.eventId,
          origins: ['automation'],
        },
      };
      const task =
        action.type === 'suggest_followup'
          ? await TaskService.upsertPendingFollowUp(event.userId, taskData)
          : await TaskService.createTask(event.userId, taskData);
      return { taskId: task._id, reusedPendingFollowUp: action.type === 'suggest_followup' };
    }
    if (
      action.type === 'generate_ai_response' ||
      action.type === 'create_proposal' ||
      action.type === 'send_message'
    ) {
      if (
        !event.conversationId ||
        !event.platform ||
        !['whatsapp', 'instagram', 'facebook'].includes(event.platform)
      )
        throw new Error('Las propuestas asistidas requieren un canal privado compatible');
      const existing = await AssistedProposal.findOne({
        userId: event.userId,
        sourceEventId: event.eventId,
      });
      if (existing)
        return { proposalId: existing._id, status: existing.status, autoSent: false, reused: true };
      const configuredMessage = config.message ?? action.message;
      const commercialContext: any = await CommercialContextService.getActive(event.userId);
      const ai =
        action.type === 'generate_ai_response' || !configuredMessage
          ? await getAIProvider().generateReply({
              incomingText: event.text ?? '',
              isNewLead: false,
              intent: String(event.data?.intent ?? 'interest'),
              normalizedIntent: String(event.data?.normalizedIntent ?? 'undetermined'),
              platform: event.platform as any,
              history: [],
              askedTopics: [],
              commercialContext: commercialContext
                ? {
                    brandName: commercialContext.brandName,
                    businessType: commercialContext.businessType,
                    commercialLines: commercialContext.commercialLines,
                    allowedInformation: commercialContext.allowedInformation,
                    informationPendingConfirmation:
                      commercialContext.informationPendingConfirmation,
                    communicationRules: commercialContext.communicationRules,
                    restrictions: commercialContext.restrictions,
                    disclaimers: commercialContext.disclaimers,
                  }
                : undefined,
            })
          : { text: String(configuredMessage) };
      const text = ai.text.slice(0, 1000);
      const recipient = event.recipient;
      if (!recipient?.externalId) throw new Error('Destinatario asistido no disponible');
      const proposal = await AssistedProposal.findOneAndUpdate(
        { userId: event.userId, sourceEventId: `automation:${execution._id}:${action._id}` },
        {
          $setOnInsert: {
            userId: event.userId,
            leadId: event.leadId,
            conversationId: event.conversationId,
            sourceEventId: `automation:${execution._id}:${action._id}`,
            platform: event.platform,
            recipient,
            text,
            originalText: text,
            status: 'proposed',
          },
        },
        { upsert: true, new: true }
      );
      await Conversation.updateOne(
        { _id: event.conversationId, userId: event.userId },
        { $set: { 'aiAnalysis.recommendedResponse': text } }
      );
      return { proposalId: proposal._id, status: 'proposed', autoSent: false };
    }
    if (action.type === 'create_or_update_lead') {
      const allowed: any = {};
      for (const key of ['fullName', 'source', 'currentChannel', 'interestLevel', 'status'])
        if (config[key] != null) allowed[key] = config[key];
      if (event.leadId) {
        await Lead.updateOne({ _id: event.leadId, userId: event.userId }, { $set: allowed });
        return { leadId: event.leadId, updated: true };
      }
      const username = String(event.data?.username ?? '').trim();
      if (!username || !event.platform)
        throw new Error('Crear lead requiere username y platform normalizados');
      const created: any = await Lead.create({
        userId: event.userId,
        username,
        platform: event.platform,
        source: event.source ?? 'automation',
        ...allowed,
      });
      event.leadId = created._id.toString();
      return { leadId: event.leadId, created: true };
    }
    throw new Error(`Acción no permitida: ${action.type}`);
  }

  static async processDueJobs(limit = 20): Promise<number> {
    let processed = 0;
    while (processed < limit) {
      const now = new Date();
      const job: any = await AutomationJob.findOneAndUpdate(
        {
          $or: [
            { status: 'pending', runAt: { $lte: now } },
            { status: 'processing', lockedAt: { $lte: new Date(now.getTime() - 5 * 60000) } },
          ],
        },
        { $set: { status: 'processing', lockedAt: now }, $inc: { attempts: 1 } },
        { new: true, sort: { runAt: 1 } }
      );
      if (!job) break;
      try {
        const flow = await AutomationFlow.findOne({ _id: job.automationId, userId: job.userId });
        const execution = await AutomationExecution.findOne({
          _id: job.executionId,
          userId: job.userId,
        });
        if (!flow || !execution) throw new Error('Automatización o ejecución no disponible');
        await this.run(flow, execution, job.context, job.resumeStep);
        await AutomationJob.updateOne({ _id: job._id }, { status: 'completed' });
      } catch (error) {
        const message = error instanceof Error ? error.message.slice(0, 500) : 'Error del worker';
        await AutomationJob.updateOne(
          { _id: job._id },
          job.attempts >= job.maxAttempts
            ? { $set: { status: 'failed', lastError: message } }
            : {
                $set: {
                  status: 'pending',
                  runAt: new Date(Date.now() + 60000),
                  lastError: message,
                },
              }
        );
      }
      processed++;
    }
    return processed;
  }
}

let timer: NodeJS.Timeout | undefined;
export const startAutomationWorker = () => {
  if (timer || process.env.NODE_ENV === 'test' || process.env.AUTOMATION_WORKER_ENABLED === 'false')
    return;
  const run = () =>
    void Promise.all([
      AutomationEngineService.processDueJobs(),
      FollowUpService.processDueFollowUps(),
      ReactivationService.processInactiveLeads(),
      MeetingAutomationService.process(),
      LaunchActionService.process(),
      MultichannelIdentityService.detectCandidates(),
    ]).catch(error =>
      console.error('Automation worker failed', {
        errorType: error instanceof Error ? error.name : 'unknown',
      })
    );
  run();
  timer = setInterval(
    run,
    Math.max(10000, Number(process.env.AUTOMATION_WORKER_INTERVAL_MS || 30000))
  );
  timer.unref();
};
