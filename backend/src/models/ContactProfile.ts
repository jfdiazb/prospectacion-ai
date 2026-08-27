import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  preferredChannel: { type: String, enum: ['whatsapp', 'instagram', 'facebook', 'youtube', 'telegram', 'manual'] },
  generalOptOut: { type: Boolean, default: false },
  generalOptOutReason: String,
  generalOptOutAt: Date,
  createdBy: String,
}, { timestamps: true });
schema.index({ userId: 1, updatedAt: -1 });
export default mongoose.model('ContactProfile', schema);
