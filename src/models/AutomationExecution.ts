import mongoose, { Schema } from 'mongoose';
const stepSchema = new Schema({ index: Number, type: String, status: String, startedAt: Date, finishedAt: Date, result: Schema.Types.Mixed, error: String, attempts: Number }, { _id: false });
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, automationId: { type: Schema.Types.ObjectId, ref: 'AutomationFlow', required: true }, leadId: { type: Schema.Types.ObjectId, ref: 'Lead' }, conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  eventId: { type: String, required: true }, idempotencyKey: { type: String, required: true, unique: true }, trigger: { type: String, required: true }, platform: String,
  startedAt: { type: Date, default: Date.now }, finishedAt: Date, status: { type: String, enum: ['running', 'waiting', 'completed', 'failed'], default: 'running' },
  steps: [stepSchema], error: String, result: Schema.Types.Mixed,
}, { timestamps: true });
schema.index({ userId: 1, automationId: 1, startedAt: -1 });
export default mongoose.model('AutomationExecution', schema);
