import Conversation from '../models/Conversation';
import Lead from '../models/Lead';
import LaunchParticipant from '../models/LaunchParticipant';
import Meeting from '../models/Meeting';

export type LaunchAttribution = { launchId: string; participantId: string };

export class LaunchAttributionService {
  static metadata(attribution?: LaunchAttribution): Record<string, string | undefined> {
    return { launchId: attribution?.launchId, launchParticipantId: attribution?.participantId };
  }
  static async resolve(userId: string, leadId: string, conversationId: string): Promise<LaunchAttribution | undefined> {
    const conversation: any = await Conversation.findOne({ _id: conversationId, userId, leadId }).select('launchId launchParticipantId').lean();
    if (!conversation) return undefined;
    let participant: any;
    if (conversation.launchId && conversation.launchParticipantId) {
      participant = await LaunchParticipant.findOne({ _id: conversation.launchParticipantId, userId, leadId, launchId: conversation.launchId }).select('_id launchId').lean();
    } else {
      const candidates: any[] = await LaunchParticipant.find({ userId, leadId, conversationId }).select('_id launchId').limit(2).lean();
      if (candidates.length === 1) participant = candidates[0];
    }
    if (!participant) return undefined;
    const attribution = { launchId: participant.launchId.toString(), participantId: participant._id.toString() };
    await Promise.all([
      Conversation.updateOne({ _id: conversationId, userId, leadId }, { $set: { launchId: participant.launchId, launchParticipantId: participant._id } }),
      Lead.updateOne({ _id: leadId, userId }, { $addToSet: { launchIds: participant.launchId } }),
    ]);
    return attribution;
  }

  static async recordReadiness(userId: string, attribution: LaunchAttribution | undefined, readiness: { ready: boolean; reason: string }, qualified: boolean): Promise<void> {
    if (!attribution) return;
    const set: any = { meetingReadiness: { ready: readiness.ready, reason: readiness.reason, evaluatedAt: new Date() } };
    if (qualified) set.qualifiedAt = new Date();
    await LaunchParticipant.updateOne({ _id: attribution.participantId, userId, launchId: attribution.launchId }, { $set: set });
  }

  static async attachMeeting(userId: string, attribution: LaunchAttribution | undefined, meetingId: any): Promise<void> {
    if (!attribution || !meetingId) return;
    const participant: any = await LaunchParticipant.findOne({ _id: attribution.participantId, userId, launchId: attribution.launchId }).select('leadId conversationId meetingId');
    if (!participant) return;
    const meeting: any = await Meeting.findOne({ _id: meetingId, userId, leadId: participant.leadId });
    if (!meeting || (participant.conversationId && meeting.conversationId?.toString() !== participant.conversationId.toString())) return;
    if (meeting.launchId && meeting.launchId.toString() !== attribution.launchId) throw new Error('La reuniÃ³n pertenece a otro lanzamiento');
    if (meeting.launchParticipantId && meeting.launchParticipantId.toString() !== attribution.participantId) throw new Error('La reuniÃ³n pertenece a otro participante');
    await Promise.all([
      Meeting.updateOne({ _id: meeting._id, userId }, { $set: { launchId: attribution.launchId, launchParticipantId: attribution.participantId } }),
      LaunchParticipant.updateOne({ _id: participant._id, userId, launchId: attribution.launchId, $or: [{ meetingId: { $exists: false } }, { meetingId: null }, { meetingId: meeting._id }] }, { $set: { meetingId: meeting._id, 'outcome.status': 'meeting_requested', 'outcome.changedAt': new Date(), 'outcome.changedBy': 'system' } }),
    ]);
  }

  static async syncMeetingOutcome(meeting: any): Promise<void> {
    if (!meeting?.launchId || !meeting?.launchParticipantId) return;
    const outcome = meeting.outcome?.type;
    const status = outcome === 'attended' ? 'converted' : ['no_show', 'cancelled', 'technical_failure'].includes(outcome) ? 'closed_lost' : undefined;
    if (!status) return;
    await LaunchParticipant.updateOne({ _id: meeting.launchParticipantId, userId: meeting.userId, launchId: meeting.launchId, leadId: meeting.leadId, meetingId: meeting._id }, { $set: { 'outcome.status': status, 'outcome.changedAt': new Date(), 'outcome.changedBy': 'meeting_lifecycle', 'outcome.evidence': { type: 'system', source: 'meeting_lifecycle', referenceId: meeting._id.toString(), occurredAt: meeting.outcome?.recordedAt || new Date() } } });
  }
}
