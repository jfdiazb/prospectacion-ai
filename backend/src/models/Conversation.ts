import mongoose, { Schema } from 'mongoose';
import type { IConversation } from '../types/index';

/**
 * Schema de ConversaciÃ³n
 */
const conversationSchema = new Schema(
  {
    leadId: {
      type: Schema.Types.ObjectId,
      ref: 'Lead',
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    messages: [
      {
        _id: { type: Schema.Types.ObjectId, auto: true },
        sender: {
          type: String,
          enum: ['user', 'lead', 'ai'],
          required: true,
        },
        text: String,
        platform: String,
        timestamp: { type: Date, default: Date.now },
        isRead: { type: Boolean, default: false },
        direction: { type: String, enum: ['inbound', 'outbound'] },
        status: { type: String, enum: ['received', 'proposed', 'pending', 'sent', 'simulated', 'failed'] },
        externalMessageId: String,
        relatedMessageId: String,
        processingError: String,
      },
    ],
    status: {
      type: String,
      enum: ['active', 'paused', 'closed'],
      default: 'active',
    },
    launchId: { type: Schema.Types.ObjectId, ref: 'Launch' },
    launchParticipantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant' },
    controlMode: {
      type: String,
      enum: ['automated', 'handoff_requested', 'human_controlled'],
      default: 'automated',
    },
    handoffReason: String,
    handoffRequestedAt: Date,
    humanControlStartedAt: Date,
    automationResumedAt: Date,
    aiAskedTopics: [{ type: String }],
    aiResponseFingerprints: [{ type: String }],
    aiMemoryInitializedAt: Date,
    commercialMemory: {
      interests: [{ type: String }],
      needs: [{ type: String }],
      objections: [{ type: String }],
      answeredTopics: [{ type: String }],
      commercialState: String,
      meetingInterest: { type: String, enum: ['unknown', 'offered', 'accepted', 'declined'], default: 'unknown' },
      lastMeetingOfferAt: Date,
      updatedThroughEventId: String,
      updatedAt: Date,
      version: { type: Number, default: 1 },
    },
    aiAnalysis: {
      sentiment: String,
      intent: String,
      objectionsDetected: [String],
      recommendedResponse: String,
    },
    lastMessage: Date,
  },
  { timestamps: true }
);

/**
 * Indices
 */
conversationSchema.index({ userId: 1, leadId: 1 });
conversationSchema.index({ userId: 1, launchId: 1, launchParticipantId: 1 });
conversationSchema.index({ userId: 1, status: 1, lastMessage: -1 });
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ status: 1 });
conversationSchema.index({ userId: 1, controlMode: 1, lastMessage: -1 });

export default mongoose.model<IConversation & mongoose.Document>('Conversation', conversationSchema);

