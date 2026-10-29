import mongoose, { Schema } from 'mongoose';

const encryptedValue = {
  ciphertext: { type: String, required: true },
  iv: { type: String, required: true },
  authTag: { type: String, required: true },
};

const tikTokCredentialSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    openId: { type: String, required: true },
    accessToken: encryptedValue,
    refreshToken: encryptedValue,
    accessTokenExpiresAt: { type: Date, required: true },
    refreshTokenExpiresAt: { type: Date, required: true },
    scope: [String],
    lastAuthFailure: { type: Schema.Types.Mixed },
    connectedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model('TikTokCredential', tikTokCredentialSchema);
