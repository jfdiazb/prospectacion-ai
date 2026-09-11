import mongoose, { Schema } from 'mongoose';

const outboundMessageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sourceEventId: { type: String, required: true },
  channel: { type: String, enum: ['instagram', 'facebook', 'whatsapp', 'youtube'] },
  messageType: { type: String, enum: ['private_reply', 'direct_message', 'whatsapp_message', 'youtube_reply'], required: true },
  text: { type: String, required: true },
  deliveryStatus: { type: String, enum: ['pending', 'sent', 'delivered', 'failed', 'simulated'], default: 'pending', required: true },
  provider: { type: String, enum: ['meta', 'youtube', 'mock'], required: true },
  externalMessageId: String,
  recipientId: { type: String, required: true },
  commentId: String,
  sentAt: Date,
  failedAt: Date,
  errorCode: String,
  errorMessage: String,
  retryCount: { type: Number, default: 0 },
  lastRetryAt: Date,
  simulatedDelivery: { type: Boolean, default: false },
  authorization: {
    mode: { type: String, enum: ['static_allowlist', 'inbound_conversation'] },
    channel: String,
    recipientId: String,
    conversationId: Schema.Types.ObjectId,
    authorizedAt: Date,
    sourceEventId: String,
    inboundAt: Date,
  },
}, { timestamps: true });

outboundMessageSchema.index({ conversationId: 1, createdAt: -1 });
outboundMessageSchema.index({ userId: 1, deliveryStatus: 1, createdAt: -1 });
outboundMessageSchema.index({ userId: 1, channel: 1, messageType: 1, createdAt: -1, recipientId: 1 });
outboundMessageSchema.index({ userId: 1, sourceEventId: 1 }, { unique: true });
export default mongoose.model('OutboundMessage', outboundMessageSchema);
