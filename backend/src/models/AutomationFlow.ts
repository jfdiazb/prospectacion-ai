import mongoose, { Schema } from 'mongoose';
import type { IAutomationFlow } from '../types/index';

/**
 * Schema de Flujos de AutomatizaciÃ³n
 */
const automationFlowSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: String,
    trigger: {
      type: {
        type: String,
        enum: ['comment', 'dm', 'story_view', 'keyword', 'schedule'],
        required: true,
      },
      keyword: String,
      keywords: [String],
    },
    actions: [
      {
        _id: { type: Schema.Types.ObjectId, auto: true },
        type: {
          type: String,
          enum: ['send_message', 'send_email', 'create_task', 'update_lead_status', 'delay'],
          required: true,
        },
        message: String,
        delay: Number,
        conditions: [
          {
            field: String,
            operator: String,
            value: mongoose.Schema.Types.Mixed,
          },
        ],
      },
    ],
    schedule: {
      frequency: String,
      daysOfWeek: [Number],
      time: String,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    executionStats: {
      totalExecutions: { type: Number, default: 0 },
      successfulExecutions: { type: Number, default: 0 },
      failedExecutions: { type: Number, default: 0 },
      lastExecution: Date,
      nextExecution: Date,
    },
  },
  { timestamps: true }
);

/**
 * Indices
 */
automationFlowSchema.index({ userId: 1, isActive: 1 });

export default mongoose.model<IAutomationFlow & mongoose.Document>('AutomationFlow', automationFlowSchema);

