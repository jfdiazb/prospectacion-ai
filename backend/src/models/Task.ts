import mongoose, { Schema } from 'mongoose';
import type { ITask } from '../types/index';

const taskSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
    conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
    title: { type: String, required: true },
    description: { type: String, required: true },
    type: {
      type: String,
      enum: ['follow_up', 'meeting', 'call', 'email', 'other'],
      default: 'follow_up',
      required: true,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'cancelled'],
      default: 'pending',
      required: true,
    },
    dueDate: Date,
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

taskSchema.index({ userId: 1, leadId: 1, status: 1, dueDate: 1 });
taskSchema.index({ userId: 1, 'metadata.globalTaskKey': 1 }, { unique: true, partialFilterExpression: { status: 'pending', 'metadata.globalTaskKey': { $type: 'string' } } });

export default mongoose.model<ITask & mongoose.Document>('Task', taskSchema);
