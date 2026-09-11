import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting', required: true },
  kind: { type: String, enum: ['reminder', 'post_meeting', 'outcome_review'], required: true },
  idempotencyKey: { type: String, required: true },
  dueAt: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'cancelled', 'failed'], default: 'pending' },
  scheduledForSnapshot: Date,
  meetingStatusSnapshot: String,
  channelSnapshot: String,
  windowMinutes: Number,
  outcome: String,
  reason: String,
  taskId: { type: Schema.Types.ObjectId, ref: 'Task' },
  proposalId: { type: Schema.Types.ObjectId, ref: 'AssistedProposal' },
  lockedAt: Date,
  attempts: { type: Number, default: 0 },
  completedAt: Date,
  lastError: String,
}, { timestamps: true });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ status: 1, dueAt: 1, lockedAt: 1 });
schema.index({ userId: 1, meetingId: 1, status: 1 });
export default mongoose.model('MeetingAction', schema);
