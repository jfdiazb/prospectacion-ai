import mongoose, { Schema } from 'mongoose';
import type { ILead } from '../types/index';

/**
 * Schema de Lead/Prospecto
 */
const leadSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    username: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      enum: ['instagram', 'facebook', 'tiktok', 'youtube','whatsapp', 'telegram', 'manual'],
      required: true,
    },
    fullName: String,
    bio: String,
    profileUrl: String,
    followers: Number,
    following: Number,
    engagement: { type: Number, default: 0 },
    status: {
      type: String,
      enum: [
        'new',
        'contacted',
        'conversation_started',
        'interested',
        'presentation_sent',
        'follow_up',
        'hot_prospect',
        'registered',
        'rejected',
      ],
      default: 'new',
    },
    interestLevel: {
      type: String,
      enum: ['cold', 'warm', 'hot'],
      default: 'cold',
    },
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    tags: [String],
    lastContact: Date,
    nextFollowUp: Date,
    followUp: {
      scheduledAt: Date,
      attempts: { type: Number, default: 0 },
      lastFollowUpAt: Date,
      nextEligibleAt: Date,
      lastDecisionAt: Date,
      lastDecision: String,
      lastReason: String,
      claimToken: String,
      claimedAt: Date,
    },
    reactivation: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: Date,
      nextEligibleAt: Date,
      lastDecisionAt: Date,
      lastDecision: String,
      lastReason: String,
      lastResult: String,
      disabledAt: Date,
      claimToken: String,
      claimedAt: Date,
    },
    notes: String,
    email: String,
    phone: String,
    source: String,
    currentChannel: String,
    commercialContextId: { type: Schema.Types.ObjectId, ref: 'CommercialContext' },
    normalizedIntent: String,
    normalizedIntents: { type: [String], default: [] },
    origin: {
      platform: String, source: String, externalContentId: String,
      initialContent: String, occurredAt: Date, publicUrl: String,
    },
    qualification: {
      intent: String,
      normalizedIntent: String,
      normalizedIntents: [String],
      matchedPhrases: [String],
      needs: [String],
      objections: [String],
      meetingRequested: { type: Boolean, default: false },
      meetingIntent: { type: String, enum: ['none', 'medium', 'high'], default: 'none' },
      conversationalScore: Number,
      conversationalSignals: Schema.Types.Mixed,
      declaredByProspect: Boolean,
      lastEvaluatedAt: Date,
      evaluatorVersion: String,
    },
    aiAnalysis: {
  type: Object,
  default: {}
},
    messageHistory: [
      {
        platform: String,
        timestamp: Date,
        content: String,
        type: String,
      },
    ],
  },
  { timestamps: true }
);

/**
 * Indices para búsquedas rápidas
 */
leadSchema.index({ userId: 1, createdAt: -1 });
leadSchema.index({ username: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ score: -1 });
leadSchema.index({ interestLevel: 1 });
leadSchema.index({ platform: 1, score: -1 });
leadSchema.index({ userId: 1, platform: 1, username: 1 });
leadSchema.index({ userId: 1, status: 1, createdAt: -1 });
leadSchema.index({ userId: 1, interestLevel: 1, score: -1 });
leadSchema.index({ nextFollowUp: 1, 'followUp.claimedAt': 1 });
leadSchema.index({ 'reactivation.nextEligibleAt': 1, 'reactivation.claimedAt': 1 });

export default mongoose.model<ILead & mongoose.Document>('Lead', leadSchema);

