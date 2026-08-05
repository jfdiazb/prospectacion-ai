import mongoose, { Schema } from 'mongoose';

const inboundEventSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  externalEventId: { type: String, required: true, unique: true },
  channel: { type: String, enum: ['instagram', 'facebook', 'whatsapp'], required: true },
  eventType: { type: String, required: true },
  senderId: { type: String, required: true },
  text: String,
  mediaId: String,
  matchedKeyword: String,
  processedAt: { type: Date, default: Date.now },
}, { timestamps: true });

inboundEventSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('InboundEvent', inboundEventSchema);
