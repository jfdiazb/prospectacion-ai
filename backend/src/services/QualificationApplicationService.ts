import Lead from '../models/Lead';
import Activity from '../models/Activity';
import QualificationHistory from '../models/QualificationHistory';
import { QualificationPolicyService, type LeadTemperature } from './QualificationPolicyService';
import { AutomationEngineService } from './AutomationEngineService';
import AssistedProposal from '../models/AssistedProposal';
import Task from '../models/Task';

type Context = { userId: string; leadId: string; conversationId: string; sourceEventId: string; platform: 'youtube' | 'whatsapp' | 'instagram' | 'facebook' | 'tiktok'; source: string; text: string; isNewLead: boolean; commercialContextId?: any; evaluation: any };

export class QualificationApplicationService {
  static async apply(context: Context): Promise<{ previous: any; current: any; history: any; duplicate: boolean }> {
    const existingHistory: any = await QualificationHistory.findOne({ userId: context.userId, sourceEventId: context.sourceEventId }).lean();
    if (existingHistory?.processingState === 'completed') return { previous: existingHistory.previous, current: existingHistory.current, history: existingHistory, duplicate: true };
    let history: any;
    try { history = await QualificationHistory.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, sourceEventId: context.sourceEventId, channel: context.platform, source: context.source, evaluatorVersion: QualificationPolicyService.version, processingState: 'processing' }); }
    catch (error: any) {
      if (error?.code !== 11000) throw error;
      const duplicate: any = await QualificationHistory.findOne({ userId: context.userId, sourceEventId: context.sourceEventId });
      const lead: any = await Lead.findOne({ _id: context.leadId, userId: context.userId }).lean();
      return { previous: duplicate?.previous, current: duplicate?.current ?? lead, history: duplicate, duplicate: true };
    }
    try {
      let previous: any; let current: any;
      for (let attempt = 0; attempt < 4; attempt++) {
        previous = await Lead.findOne({ _id: context.leadId, userId: context.userId }).lean();
        if (!previous) throw new Error('Lead no disponible para calificación');
        const rejected = context.evaluation.intent === 'rejection' || context.evaluation.normalizedIntent === 'rejection';
        const interestLevel = QualificationPolicyService.temperature(context.evaluation.score, previous.interestLevel as LeadTemperature, rejected);
        const status = QualificationPolicyService.status(context.evaluation.score, context.evaluation.intent, context.evaluation.signals?.meetingIntent, previous.status);
        const intents = [...new Set([...(previous.normalizedIntents ?? []), ...(previous.qualification?.normalizedIntents ?? []), ...(context.evaluation.normalizedIntent === 'undetermined' ? [] : [context.evaluation.normalizedIntent])])].slice(-QualificationPolicyService.maxIntentHistory());
        const evaluatedAt = new Date();
        const update: any = { status, score: context.evaluation.score, interestLevel, lastContact: evaluatedAt,
          nextFollowUp: rejected ? null : new Date(evaluatedAt.getTime() + 86400000), commercialContextId: context.commercialContextId,
          normalizedIntent: context.evaluation.normalizedIntent, normalizedIntents: intents,
          'followUp.scheduledAt': rejected ? null : evaluatedAt, 'followUp.lastDecision': rejected ? 'cancelled' : 'scheduled', 'followUp.lastReason': rejected ? 'lead_rejected' : 'inbound_processed',
          qualification: { ...(previous.qualification || {}), intent: context.evaluation.intent, normalizedIntent: context.evaluation.normalizedIntent, normalizedIntents: intents,
            matchedPhrases: (context.evaluation.matchedPhrases ?? []).slice(0, 20), meetingRequested: context.evaluation.signals?.meetingIntent === 'high', meetingIntent: context.evaluation.signals?.meetingIntent,
            conversationalScore: context.evaluation.score, conversationalSignals: context.evaluation.signals, declaredByProspect: true, lastEvaluatedAt: evaluatedAt, evaluatorVersion: QualificationPolicyService.version } };
        const result: any = await Lead.findOneAndUpdate({ _id: context.leadId, userId: context.userId, updatedAt: previous.updatedAt }, { $set: update, $addToSet: { tags: { $each: context.evaluation.tags ?? [] } } }, { new: true });
        if (result) { current = result.toObject(); break; }
      }
      if (!current) throw new Error('Conflicto concurrente al aplicar calificación');
      const reasons = QualificationPolicyService.reasons(context.evaluation, previous);
      const historyUpdate = { processingState: 'completed', previous: { score: previous.score, status: previous.status, interestLevel: previous.interestLevel, normalizedIntent: previous.normalizedIntent },
        current: { score: current.score, status: current.status, interestLevel: current.interestLevel, normalizedIntent: current.normalizedIntent, meetingIntent: current.qualification?.meetingIntent },
        scoreDelta: current.score - Number(previous.score || 0), reasons, matchedPhrases: (context.evaluation.matchedPhrases ?? []).slice(0, 20),
        signalSummary: { need: context.evaluation.signals?.need, commercialExperience: context.evaluation.signals?.commercialExperience, nutritionAffinity: context.evaluation.signals?.nutritionAffinity, entrepreneurshipOpenness: context.evaluation.signals?.entrepreneurshipOpenness, interest: context.evaluation.signals?.interest, meetingIntent: context.evaluation.signals?.meetingIntent, rejectionReason: context.evaluation.signals?.rejectionReason },
        commercialContextId: context.commercialContextId, evaluatedAt: new Date() };
      history = await QualificationHistory.findByIdAndUpdate(history._id, { $set: historyUpdate }, { new: true });
      await Activity.create({ userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, type: 'qualified', description: `Calificación ${previous.score ?? 0} → ${current.score} (${current.interestLevel})`, metadata: { historyId: history._id, evaluatorVersion: QualificationPolicyService.version, previous: historyUpdate.previous, current: historyUpdate.current, scoreDelta: historyUpdate.scoreDelta, reasons, platform: context.platform } });
      if (previous.status !== current.status) {
        const stale: any[] = await AssistedProposal.find({ userId: context.userId, leadId: context.leadId, purpose: 'reactivation', status: { $in: ['proposed', 'failed'] } }).select('_id').lean();
        const ids = stale.map(item => item._id);
        if (ids.length) await Promise.all([
          AssistedProposal.updateMany({ _id: { $in: ids } }, { $set: { status: 'cancelled', invalidatedAt: new Date(), invalidationReason: 'lead_status_changed', errorMessage: 'Reactivación caducada: cambió el estado del lead' } }),
          Task.updateMany({ userId: context.userId, 'metadata.proposalId': { $in: ids }, status: 'pending' }, { $set: { status: 'cancelled', 'metadata.cancelReason': 'lead_status_changed' } }),
        ]);
      }
      await AutomationEngineService.emitLeadLifecycleEvents({ eventId: context.sourceEventId, userId: context.userId, leadId: context.leadId, conversationId: context.conversationId, platform: context.platform, source: context.source, text: context.text, data: { score: current.score, previousScore: previous.score, scoreDelta: current.score - Number(previous.score || 0), interestLevel: current.interestLevel, previousInterestLevel: previous.interestLevel, status: current.status, previousStatus: previous.status, tags: current.tags, intent: current.qualification?.intent, normalizedIntent: current.normalizedIntent, normalizedIntents: current.normalizedIntents, meetingIntent: current.qualification?.meetingIntent, qualificationReasons: reasons, evaluatorVersion: QualificationPolicyService.version, commercialContextId: context.commercialContextId?.toString() } }, context.isNewLead ? null : previous, current);
      return { previous, current, history, duplicate: false };
    } catch (error) { await QualificationHistory.deleteOne({ _id: history._id, processingState: 'processing' }); throw error; }
  }
}
