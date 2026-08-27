import mongoose, { Schema } from 'mongoose';
import { evidenceTypes, launchChannels, participantStates } from '../types/launch';

const evidenceSchema = new Schema({
  type: { type: String, enum: evidenceTypes, required: true }, referenceId: { type: String, maxlength: 300 },
  source: { type: String, maxlength: 120 }, channel: { type: String, enum: launchChannels }, recordedBy: { type: String, maxlength: 120 }, occurredAt: { type: Date, required: true }, note: { type: String, maxlength: 500 }, metadata: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });
const stateSchema = (values: readonly string[], initial: string) => new Schema({
  status: { type: String, enum: values, default: initial, required: true }, changedAt: Date, changedBy: String, evidence: evidenceSchema,
}, { _id: false });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  launchId: { type: Schema.Types.ObjectId, ref: 'Launch', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  contactId: { type: Schema.Types.ObjectId, ref: 'ContactProfile' },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  meetingId: { type: Schema.Types.ObjectId, ref: 'Meeting' },
  participantKey: { type: String, required: true },
  source: { type: String, required: true, trim: true, maxlength: 120 },
  entryChannel: { type: String, enum: launchChannels },
  joinedAt: { type: Date, default: Date.now, required: true },
  stage: { type: stateSchema(participantStates.stage, 'selected'), default: () => ({ status: 'selected' }) },
  invitation: { type: stateSchema(participantStates.invitation, 'not_invited'), default: () => ({ status: 'not_invited' }) },
  registration: { type: stateSchema(participantStates.registration, 'unknown'), default: () => ({ status: 'unknown' }) },
  confirmation: { type: stateSchema(participantStates.confirmation, 'unknown'), default: () => ({ status: 'unknown' }) },
  attendance: { type: stateSchema(participantStates.attendance, 'unknown'), default: () => ({ status: 'unknown' }) },
  outcome: { type: stateSchema(participantStates.outcome, 'pending'), default: () => ({ status: 'pending' }) },
  nextAction: { type: { type: String, maxlength: 100 }, dueAt: Date, status: { type: String, enum: ['pending', 'completed', 'cancelled'] } },
  lifecycleVersion: { type: Number, default: 1, min: 1 },
  lastActivityAt: { type: Date, default: Date.now },
  addedBy: { type: String, required: true, maxlength: 120 },
  initialEvidence: evidenceSchema,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ userId: 1, launchId: 1, participantKey: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, leadId: 1 }, { unique: true });
schema.index({ userId: 1, launchId: 1, 'stage.status': 1, lastActivityAt: -1 });
schema.index({ userId: 1, leadId: 1, createdAt: -1 });
export default mongoose.model('LaunchParticipant', schema);
