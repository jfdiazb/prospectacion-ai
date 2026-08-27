import Launch from '../models/Launch';
import LaunchParticipant from '../models/LaunchParticipant';
import LaunchAction from '../models/LaunchAction';
import LaunchEvent from '../models/LaunchEvent';
import Lead from '../models/Lead';
import Meeting from '../models/Meeting';
import ContactIdentity from '../models/ContactIdentity';
import ContactProfile from '../models/ContactProfile';
import { LaunchDomainError } from './LaunchDomainError';
import { LaunchOperationsService } from './LaunchOperationsService';

export class LaunchCrmService {
  static async list(userId: string, filters: Record<string, unknown> = {}) {
    const query: any = { userId };
    if (filters.status) query.status = filters.status;
    if (filters.typeKey) query.typeKey = filters.typeKey;
    if (filters.from || filters.to) {
      query.eventStartsAt = {};
      if (filters.from) query.eventStartsAt.$gte = new Date(String(filters.from));
      if (filters.to) query.eventStartsAt.$lte = new Date(String(filters.to));
    }
    const launches: any[] = await Launch.find(query)
      .sort({ eventStartsAt: -1, createdAt: -1 })
      .lean();
    return Promise.all(
      launches.map(async launch => {
        const [metrics, pendingActions, meetingRequested] = await Promise.all([
          LaunchOperationsService.metrics(userId, launch._id.toString()),
          LaunchAction.countDocuments({
            userId,
            launchId: launch._id,
            status: { $in: ['pending', 'processing'] },
          }),
          LaunchParticipant.countDocuments({
            userId,
            launchId: launch._id,
            'outcome.status': 'meeting_requested',
          }),
        ]);
        return { ...launch, metrics: { ...metrics, pendingActions, meetingRequested } };
      })
    );
  }

  static async detail(userId: string, launchId: string) {
    const launch: any = await Launch.findOne({ _id: launchId, userId }).lean();
    if (!launch) throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const [metrics, participants, actions, events] = await Promise.all([
      LaunchOperationsService.metrics(userId, launchId),
      this.participants(userId, launchId),
      this.actions(userId, launchId),
      LaunchEvent.find({ userId, launchId }).sort({ occurredAt: -1 }).limit(200).lean(),
    ]);
    return {
      launch,
      metrics: {
        ...metrics,
        meetingRequested: participants.filter(item => item.outcome.status === 'meeting_requested')
          .length,
        pendingActions: actions.filter(item => ['pending', 'processing'].includes(item.status))
          .length,
      },
      participants,
      actions,
      events,
    };
  }

  static async participants(userId: string, launchId: string) {
    if (!(await Launch.exists({ _id: launchId, userId })))
      throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const rows: any[] = await LaunchParticipant.find({ userId, launchId })
      .sort({ joinedAt: -1 })
      .lean();
    const leadIds = rows.map(item => item.leadId);
    const meetingIds = rows.map(item => item.meetingId).filter(Boolean);
    const [leads, meetings, actions, identities] = await Promise.all([
      Lead.find({ userId, _id: { $in: leadIds } })
        .select(
          'fullName username platform currentChannel score interestLevel normalizedIntent qualification status tags'
        )
        .lean(),
      Meeting.find({ userId, $or: [{ _id: { $in: meetingIds } }, { leadId: { $in: leadIds } }] })
        .select('leadId status scheduledFor scheduledAt provider topic')
        .sort({ createdAt: -1 })
        .lean(),
      LaunchAction.find({ userId, launchId, status: { $in: ['pending', 'processing'] } })
        .sort({ dueAt: 1 })
        .lean(),
      ContactIdentity.find({ userId, leadId: { $in: leadIds }, status: 'active' })
        .select('leadId contactId platform consentStatus')
        .lean(),
    ]);
    const contacts: any[] = await ContactProfile.find({
      userId,
      _id: { $in: identities.map(item => item.contactId) },
    })
      .select('preferredChannel generalOptOut')
      .lean();
    return rows.map(item => ({
      ...item,
      lead: leads.find(lead => lead._id.toString() === item.leadId.toString()),
      meeting:
        meetings.find(meeting => meeting._id.toString() === item.meetingId?.toString()) ||
        meetings.find(meeting => meeting.leadId?.toString() === item.leadId.toString()),
      pendingAction: actions.find(
        action => action.participantId.toString() === item._id.toString()
      ),
      identitySafety: (() => {
        const identity: any = identities.find(
          value => value.leadId.toString() === item.leadId.toString()
        );
        const contact: any =
          identity &&
          contacts.find(value => value._id.toString() === identity.contactId.toString());
        return identity
          ? {
              consentStatus: identity.consentStatus,
              preferredChannel: contact?.preferredChannel,
              generalOptOut: Boolean(contact?.generalOptOut),
              blocked: identity.consentStatus === 'blocked',
            }
          : undefined;
      })(),
    }));
  }

  static async actions(userId: string, launchId: string, status?: string) {
    if (!(await Launch.exists({ _id: launchId, userId })))
      throw new LaunchDomainError('Lanzamiento no encontrado', 'LAUNCH_NOT_FOUND');
    const query: any = { userId, launchId };
    if (status === 'expired' || status === 'invalidated') query.status = 'cancelled';
    else if (status === 'executed') query.status = 'completed';
    else if (status) query.status = status;
    return LaunchAction.find(query)
      .populate({
        path: 'participantId',
        select: 'leadId stage registration confirmation attendance outcome',
      })
      .populate({ path: 'leadId', select: 'fullName username currentChannel platform status tags' })
      .populate({ path: 'taskId', select: 'title status dueDate priority' })
      .populate({
        path: 'proposalId',
        select: 'text status platform expiresAt invalidationReason conversationId',
      })
      .sort({ dueAt: -1 })
      .lean();
  }
}
