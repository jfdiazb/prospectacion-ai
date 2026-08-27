import mongoose, { Schema } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true },
    accountId: { type: String, required: true, trim: true, maxlength: 200 },
    contentId: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
    mappingKey: { type: String, required: true, maxlength: 600 },
    publishedAt: Date,
    createdBy: { type: String, required: true, maxlength: 120 },
    deactivatedAt: Date,
    metadata: {
      sourceCode: { type: String, maxlength: 80 },
      title: { type: String, maxlength: 200 },
    },
  },
  { timestamps: true }
);
schema.index({ userId: 1, accountId: 1, contentId: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, status: 1 });
schema.index({ userId: 1, mappingKey: 1 }, { unique: true });
export default mongoose.model('LaunchTikTokContent', schema);
