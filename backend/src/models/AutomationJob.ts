import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, automationId: { type: Schema.Types.ObjectId, ref: 'AutomationFlow', required: true }, executionId: { type: Schema.Types.ObjectId, ref: 'AutomationExecution', required: true, unique: true },
  runAt: { type: Date, required: true }, resumeStep: { type: Number, required: true }, context: { type: Schema.Types.Mixed, required: true },
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' }, attempts: { type: Number, default: 0 }, maxAttempts: { type: Number, default: 3 }, lockedAt: Date, lastError: String,
}, { timestamps: true });
schema.index({ status: 1, runAt: 1 });
export default mongoose.model('AutomationJob', schema);
