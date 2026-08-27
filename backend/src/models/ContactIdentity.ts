import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  contactId: { type: Schema.Types.ObjectId, ref: 'ContactProfile', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  platform: { type: String, required: true },
  externalId: { type: String, required: true },
  status: { type: String, enum: ['active', 'unlinked'], default: 'active' },
  consentStatus: { type: String, enum: ['unknown', 'consented', 'opted_out', 'blocked'], default: 'unknown' },
  consentReason: String,
  consentUpdatedAt: Date,
  confirmationSource: { type: String, required: true },
  confirmedAt: { type: Date, default: Date.now },
  confirmedBy: String,
  unlinkedAt: Date,
  unlinkedBy: String,
}, { timestamps: true });
schema.index({ userId: 1, platform: 1, externalId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
schema.index({ userId: 1, leadId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });
schema.index({ userId: 1, contactId: 1, status: 1 });
export default mongoose.model('ContactIdentity', schema);
