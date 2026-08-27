import mongoose, { Schema } from 'mongoose';
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadAId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  leadBId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  candidateKey: { type: String, required: true },
  signals: [{ type: String }],
  status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
  resolvedAt: Date,
  resolvedBy: String,
  resolutionReason: String,
}, { timestamps: true });
schema.index({ userId: 1, candidateKey: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, createdAt: -1 });
export default mongoose.model('DuplicateCandidate', schema);
