import Conversation from '../models/Conversation';
import Meeting from '../models/Meeting';

const unique = (values: unknown[], limit = 12) => [...new Set(values.filter(value => typeof value === 'string' && value.trim()).map(value => String(value).trim()))].slice(-limit);

export class ConversationMemoryService {
  static async update(context: { userId: string; conversationId: string; sourceEventId: string; evaluation: any; meetingReadiness: any; status: string }) {
    const conversation: any = await Conversation.findOne({ _id: context.conversationId, userId: context.userId }).select('commercialMemory').lean();
    if (!conversation || conversation.commercialMemory?.updatedThroughEventId === context.sourceEventId) return conversation?.commercialMemory;
    const previous = conversation.commercialMemory ?? {};
    const signals = context.evaluation?.signals ?? {};
    const interests = unique([...(previous.interests ?? []), ...(context.evaluation?.normalizedIntent && context.evaluation.normalizedIntent !== 'undetermined' ? [context.evaluation.normalizedIntent] : [])]);
    const needs = unique([...(previous.needs ?? []), ...(signals.need >= 70 ? ['declared_need'] : []), ...(context.evaluation?.matchedPhrases ?? [])], 16);
    const objections = unique([...(previous.objections ?? []), ...(signals.rejectionReason ? [signals.rejectionReason] : [])]);
    const reason = context.meetingReadiness?.reason;
    const meetingInterest = reason === 'explicit_acceptance' || reason === 'explicit_request' ? 'accepted'
      : reason === 'meeting_declined' ? 'declined'
        : reason === 'qualified_discovery' ? 'offered'
          : previous.meetingInterest ?? 'unknown';
    const memory = {
      interests, needs, objections,
      answeredTopics: unique(previous.answeredTopics ?? []),
      commercialState: context.status,
      meetingInterest,
      lastMeetingOfferAt: reason === 'qualified_discovery' ? new Date() : previous.lastMeetingOfferAt,
      updatedThroughEventId: context.sourceEventId,
      updatedAt: new Date(),
      version: 1,
    };
    await Conversation.updateOne({ _id: context.conversationId, userId: context.userId }, { $set: { commercialMemory: memory } });
    return memory;
  }

  static async get(userId: string, conversationId: string) {
    const [conversation, meeting]: any[] = await Promise.all([
      Conversation.findOne({ _id: conversationId, userId }).select('commercialMemory aiAskedTopics').lean(),
      Meeting.findOne({ conversationId, userId }).sort({ createdAt: -1 }).select('status provider').lean(),
    ]);
    return {
      ...(conversation?.commercialMemory ?? {}),
      askedTopics: conversation?.aiAskedTopics ?? [],
      bookingStatus: meeting?.status,
      bookingProvider: meeting?.provider,
    };
  }
}
