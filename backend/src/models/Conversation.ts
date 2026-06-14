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
      },
    ],
    status: {
      type: String,
      enum: ['active', 'paused', 'closed'],
      default: 'active',
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
conversationSchema.index({ createdAt: -1 });
conversationSchema.index({ status: 1 });

export default mongoose.model<IConversation & mongoose.Document>('Conversation', conversationSchema);

