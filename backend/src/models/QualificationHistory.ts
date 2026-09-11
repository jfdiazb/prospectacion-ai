import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true }, leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true }, conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  sourceEventId: { type: String, required: true }, channel: String, source: String, evaluatorVersion: { type: String, required: true }, processingState: { type: String, enum: ['processing', 'completed'], default: 'processing' },
  launchId: { type: Schema.Types.ObjectId, ref: 'Launch' }, launchParticipantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant' }, meetingReadiness: Schema.Types.Mixed,
  previous: { score: Number, status: String, interestLevel: String, normalizedIntent: String },
  current: { score: Number, status: String, interestLevel: String, normalizedIntent: String, meetingIntent: String },
  scoreDelta: Number, reasons: [String], matchedPhrases: [String], signalSummary: Schema.Types.Mixed, commercialContextId: { type: Schema.Types.ObjectId, ref: 'CommercialContext' }, evaluatedAt: Date,
}, { timestamps: true });
schema.index({ userId: 1, sourceEventId: 1 }, { unique: true });
schema.index({ userId: 1, leadId: 1, evaluatedAt: -1 });
export default mongoose.model('QualificationHistory', schema);
