import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  contactId: { type: Schema.Types.ObjectId, ref: 'ContactProfile' },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  action: { type: String, enum: ['link_created', 'link_rejected', 'link_removed', 'preferred_channel_changed', 'channel_consent_changed', 'general_opt_out_changed', 'proposal_invalidated_multichannel'], required: true },
  actor: String,
  source: String,
  reason: String,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, contactId: 1, createdAt: -1 });
export default mongoose.model('IdentityAudit', schema);
