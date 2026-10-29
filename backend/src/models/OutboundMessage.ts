import mongoose, { Schema } from 'mongoose';

const outboundMessageSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sourceEventId: { type: String, required: true },
  channel: { type: String, enum: ['instagram', 'facebook', 'whatsapp', 'youtube'] },
  messageType: { type: String, enum: ['private_reply', 'direct_message', 'whatsapp_message', 'youtube_reply'], required: true },
  transportKind: {
    type: String,
    enum: ['private_reply', 'direct_message', 'whatsapp_message', 'youtube_comment_reply', 'public_comment_reply'],
  },
  text: { type: String, required: true },
  deliveryStatus: {
    type: String,
    enum: ['generated', 'queued', 'sent', 'confirmed', 'failed', 'unknown', 'simulated', 'pending', 'delivered'],
    default: 'generated',
    required: true,
  },
  provider: { type: String, enum: ['meta', 'youtube', 'mock'], required: true },
  externalMessageId: String,
  correlationId: String,
  credentialFingerprint: String,
  recipientId: { type: String, required: true },
  commentId: String,
  sentAt: Date,
  confirmedAt: Date,
  lastVerificationAt: Date,
  confirmationEvidenceSource: { type: String, enum: ['provider_webhook', 'provider_readback'] },
  providerLatencyMs: Number,
  failedAt: Date,
  errorCode: String,
  errorMessage: String,
  providerErrorCode: Number,
  providerErrorSubcode: Number,
  requiresReauthorization: { type: Boolean, default: false },
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
outboundMessageSchema.index({ channel: 1, credentialFingerprint: 1, requiresReauthorization: 1, deliveryStatus: 1 });
outboundMessageSchema.index({ userId: 1, sourceEventId: 1 }, { unique: true });
export default mongoose.model('OutboundMessage', outboundMessageSchema);
