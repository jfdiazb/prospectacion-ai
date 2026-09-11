import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  cacheKey: { type: String, required: true },
  results: { type: [Schema.Types.Mixed], required: true },
  nextPageToken: String,
  expiresAt: { type: Date, required: true },
}, { timestamps: true });
schema.index({ userId: 1, cacheKey: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model('HunterSearchCache', schema);
