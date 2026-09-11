import mongoose, { Schema } from 'mongoose';
const rule = new Schema({ id: { type: String, required: true }, field: { type: String, required: true }, operator: { type: String, required: true }, value: Schema.Types.Mixed }, { _id: false });
const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true }, version: { type: Number, required: true }, schemaVersion: { type: Number, default: 1 },
  definition: { type: Schema.Types.Mixed, required: true }, definitionHash: { type: String, required: true }, createdBy: { type: String, required: true }, reason: String,
  summary: { logic: String, rules: [rule], ruleCount: Number, groupCount: Number },
}, { timestamps: true });
schema.index({ userId: 1, launchId: 1, version: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, definitionHash: 1 });
export default mongoose.model('LaunchSegmentVersion', schema);
