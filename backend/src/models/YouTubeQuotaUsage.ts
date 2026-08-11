import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  scopeId: { type: String, required: true },
  day: { type: String, required: true },
  searchCalls: { type: Number, default: 0 },
  generalUnits: { type: Number, default: 0 },
}, { timestamps: true });
schema.index({ scopeId: 1, day: 1 }, { unique: true });
export default mongoose.model('YouTubeQuotaUsage', schema);
