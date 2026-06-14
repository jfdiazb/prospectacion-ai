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
      enum: ['instagram', 'facebook', 'tiktok', 'whatsapp', 'telegram', 'manual'],
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
    notes: String,
    email: String,
    phone: String,
    source: String,
    aiAnalysis: String,
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
 * Indices para bÃºsquedas rÃ¡pidas
 */
leadSchema.index({ userId: 1, createdAt: -1 });
leadSchema.index({ username: 1 });
leadSchema.index({ email: 1 });
leadSchema.index({ score: -1 });
leadSchema.index({ interestLevel: 1 });
leadSchema.index({ platform: 1 });

export default mongoose.model<ILead & mongoose.Document>('Lead', leadSchema);

