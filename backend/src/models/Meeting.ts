import mongoose, { Schema } from 'mongoose';

const meetingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  provider: { type: String, enum: ['zoom', 'calendly'], default: 'zoom' },
  status: { type: String, enum: ['pending_details', 'pending_booking', 'pending_configuration', 'scheduled', 'cancelled', 'failed'], default: 'pending_details' },
  scheduledFor: Date,
  timezone: String,
  attendeeEmail: String,
  requestedDate: String,
  requestedTime: String,
  sourceEventId: String,
  externalId: String,
  joinUrl: String,
  bookingUrl: String,
  bookingToken: String,
  inviteeUri: String,
  topic: String,
  error: String,
  errorCode: String,
  errorMessage: String,
  failedAt: Date,
}, { timestamps: true });

meetingSchema.index({ userId: 1, leadId: 1, createdAt: -1 });
meetingSchema.index({ conversationId: 1, status: 1 });
meetingSchema.index({ bookingToken: 1 }, { sparse: true, unique: true });
export default mongoose.model('Meeting', meetingSchema);
