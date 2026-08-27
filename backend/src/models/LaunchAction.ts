import mongoose, { Schema } from 'mongoose';
const kinds = ['invitation', 'registration_reminder', 'event_reminder', 'pre_event_message', 'post_event_followup', 'no_show_recovery', 'interested_followup', 'next_step_proposal'];
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true }, participantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant', required: true }, leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true }, conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  kind: { type: String, enum: kinds, required: true }, status: { type: String, enum: ['pending', 'processing', 'completed', 'skipped', 'cancelled', 'failed'], default: 'pending' }, idempotencyKey: { type: String, required: true }, triggerEventId: String, triggerType: String,
  dueAt: { type: Date, required: true }, expiresAt: Date, priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' }, reason: String, proposedChannel: String, recipient: { type: { type: String }, externalId: String },
  launchSnapshot: { status: String, configurationVersion: Number, eventStartsAt: Date, eventEndsAt: Date, closesAt: Date, timezone: String }, participantSnapshot: { lifecycleVersion: Number, stage: String, invitation: String, registration: String, confirmation: String, attendance: String, outcome: String }, conversationLastMessageAt: Date,
  taskId: { type: Schema.Types.ObjectId, ref: 'Task' }, proposalId: { type: Schema.Types.ObjectId, ref: 'AssistedProposal' }, attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 3 }, lockedAt: Date, completedAt: Date, invalidatedAt: Date, invalidationReason: String, lastError: String, metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true }); schema.index({ status: 1, dueAt: 1, lockedAt: 1 }); schema.index({ userId: 1, launchId: 1, participantId: 1, kind: 1, status: 1 });
export default mongoose.model('LaunchAction', schema);
