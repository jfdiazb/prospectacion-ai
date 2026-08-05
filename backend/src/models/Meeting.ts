import mongoose, { Schema } from 'mongoose';

const meetingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  provider: { type: String, enum: ['zoom'], default: 'zoom' },
  status: { type: String, enum: ['pending_details', 'pending_configuration', 'scheduled', 'cancelled', 'failed'], default: 'pending_details' },
  scheduledFor: Date,
  timezone: { type: String, default: 'America/Bogota' },
  externalId: String,
  joinUrl: String,
  topic: String,
  error: String,
}, { timestamps: true });

meetingSchema.index({ userId: 1, leadId: 1, createdAt: -1 });
export default mongoose.model('Meeting', meetingSchema);
