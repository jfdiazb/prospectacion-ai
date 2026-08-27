import mongoose, { Schema } from 'mongoose';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true },
    platform: { type: String, enum: ['instagram', 'facebook'], required: true },
    accountId: { type: String, required: true, trim: true, maxlength: 200 },
    contentId: { type: String, required: true, trim: true, maxlength: 300 },
    status: { type: String, enum: ['active', 'inactive'], default: 'active', required: true },
    mappingKey: { type: String, required: true, maxlength: 800 },
    createdBy: { type: String, required: true, maxlength: 120 },
    deactivatedAt: Date,
    metadata: {
      sourceCode: { type: String, maxlength: 80 },
      contentType: { type: String, enum: ['post', 'reel', 'video', 'ad_creative', 'other'] },
    },
  },
  { timestamps: true }
);
schema.index({ userId: 1, platform: 1, accountId: 1, contentId: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, status: 1 });
schema.index({ userId: 1, mappingKey: 1 }, { unique: true });
export default mongoose.model('LaunchMetaContent', schema);
