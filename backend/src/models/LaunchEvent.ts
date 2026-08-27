import mongoose, { Schema } from 'mongoose';
import { evidenceTypes } from '../types/launch';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true },
  participantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant' },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
  eventType: { type: String, required: true, maxlength: 120 },
  idempotencyKey: { type: String, required: true, maxlength: 300 },
  source: { type: String, required: true, maxlength: 120 },
  actor: { type: String, required: true, maxlength: 120 },
  occurredAt: { type: Date, default: Date.now, required: true },
  evidence: { type: { type: String, enum: evidenceTypes }, source: String, channel: String, referenceId: String, recordedBy: String, occurredAt: Date, note: String, metadata: Schema.Types.Mixed },
  previousState: Schema.Types.Mixed,
  currentState: Schema.Types.Mixed,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ userId: 1, idempotencyKey: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, occurredAt: -1 });
schema.index({ userId: 1, participantId: 1, occurredAt: -1 });
schema.index({ userId: 1, launchId: 1, eventType: 1, source: 1, 'evidence.referenceId': 1 }, { unique: true, partialFilterExpression: { 'evidence.referenceId': { $type: 'string' } } });
export default mongoose.model('LaunchEvent', schema);
