import mongoose, { Schema } from 'mongoose';

const encryptedValue = {
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
};

const youtubeCredentialSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  channelId: { type: String, required: true },
  channelTitle: String,
  refreshToken: encryptedValue,
  accessToken: encryptedValue,
  accessTokenExpiresAt: { type: Date, required: true },
  scope: [String],
  lastPolledAt: Date,
  lastRepliesPolledAt: Date,
  lastPollingSummary: { type: Schema.Types.Mixed },
  lastReplyPollingSummary: { type: Schema.Types.Mixed },
  connectedAt: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('YouTubeCredential', youtubeCredentialSchema);
