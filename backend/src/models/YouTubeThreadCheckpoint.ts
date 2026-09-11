import mongoose, { Schema } from 'mongoose';

const youtubeThreadCheckpointSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  threadId: { type: String, required: true },
  lastCheckedAt: Date,
  lastSucceededAt: Date,
  lastFailedAt: Date,
  consecutiveFailures: { type: Number, default: 0 },
}, { timestamps: true });

youtubeThreadCheckpointSchema.index({ userId: 1, threadId: 1 }, { unique: true });
youtubeThreadCheckpointSchema.index({ userId: 1, lastCheckedAt: 1 });

export default mongoose.model('YouTubeThreadCheckpoint', youtubeThreadCheckpointSchema);
