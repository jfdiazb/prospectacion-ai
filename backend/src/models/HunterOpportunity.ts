import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  youtubeChannelId: { type: String, required: true },
  youtubeVideoId: String,
  kind: { type: String, enum: ['channel', 'video'], required: true },
  title: { type: String, required: true },
  channelTitle: String,
  description: String,
  profileUrl: { type: String, required: true },
  thumbnailUrl: String,
  followers: Number,
  views: Number,
  publishedAt: Date,
  score: { type: Number, default: 0 },
  status: { type: String, enum: ['saved', 'converted'], default: 'saved' },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
}, { timestamps: true });

schema.index({ userId: 1, youtubeChannelId: 1, youtubeVideoId: 1 }, { unique: true });
schema.index({ userId: 1, createdAt: -1 });
export default mongoose.model('HunterOpportunity', schema);
