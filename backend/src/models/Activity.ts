import mongoose, { Schema } from 'mongoose';

const activitySchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  type: { type: String, enum: ['lead_captured', 'message_received', 'message_generated', 'qualified', 'follow_up_scheduled', 'meeting_requested', 'meeting_created', 'task_created'], required: true },
  description: { type: String, required: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

activitySchema.index({ userId: 1, leadId: 1, createdAt: -1 });
export default mongoose.model('Activity', activitySchema);
