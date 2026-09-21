import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  sourceEventId: { type: String, required: true },
  purpose: { type: String, required: true },
  channel: String,
  provider: { type: String, default: 'groq' },
  model: { type: String, required: true },
  promptHash: { type: String, required: true },
  status: { type: String, enum: ['processing', 'completed', 'failed'], default: 'processing' },
  responseText: String,
  promptTokens: Number,
  completionTokens: Number,
  totalTokens: Number,
  reasoningTokens: Number,
  latencyMs: Number,
  retryCount: { type: Number, default: 0 },
  completedAt: Date,
  failedAt: Date,
  errorType: String,
}, { timestamps: true });

schema.index({ userId: 1, sourceEventId: 1, purpose: 1 }, { unique: true });
schema.index({ userId: 1, conversationId: 1, createdAt: -1 });
schema.index({ userId: 1, channel: 1, createdAt: -1 });

export default mongoose.model('AIInvocation', schema);
