import mongoose, { Schema } from 'mongoose';

const inboundEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  externalEventId: { type: String, required: true, unique: true },
  channel: { type: String, enum: ['youtube', 'instagram', 'facebook', 'whatsapp'], required: true },
  eventType: { type: String, required: true },
  senderId: { type: String, required: true },
  text: String,
  mediaId: String,
  matchedKeyword: String,
  processingState: { type: String, enum: ['processing', 'completed', 'failed'] },
  processingStartedAt: Date,
  processingAttempts: { type: Number, default: 0 },
  retryAfter: Date,
  processingFailedAt: Date,
  conversationRecordedAt: Date,
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

inboundEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('InboundEvent', inboundEventSchema);
