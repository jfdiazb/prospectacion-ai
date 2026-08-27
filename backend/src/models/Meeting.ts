import mongoose, { Schema } from 'mongoose';

const meetingSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
  provider: { type: String, enum: ['zoom', 'calendly'], default: 'zoom' },
  status: { type: String, enum: ['potential', 'requested', 'pending_confirmation', 'confirmed', 'completed', 'cancelled', 'failed', 'reschedule_requested', 'pending_details', 'pending_booking', 'pending_configuration', 'scheduled', 'pending_review', 'no_show'], default: 'potential' },
  requestedAt: Date,
  scheduledAt: Date,
  scheduledFor: Date,
  timezone: String,
  durationMinutes: { type: Number, default: 30 },
  originChannel: String,
  attendeeEmail: String,
  requestedDate: String,
  requestedTime: String,
  sourceEventId: String,
  externalId: String,
  externalMeetingId: String,
  joinUrl: String,
  startUrl: { type: String, select: false },
  bookingUrl: String,
  bookingToken: String,
  inviteeUri: String,
  topic: String,
  error: String,
  errorCode: String,
  errorMessage: String,
  failedAt: Date,
  proposedSlots: [Date],
  optionsExpiresAt: Date,
  selectedSlot: Date,
  confirmationRequestedAt: Date,
  confirmationAttempts: { type: Number, default: 0 },
  reservationKey: { type: String, select: false },
  outcome: {
    type: { type: String, enum: ['attended', 'no_show', 'cancelled', 'technical_failure', 'pending_review'] },
    actor: { type: String, enum: ['prospect', 'host', 'unknown'] },
    reason: String,
    recordedAt: Date,
    recordedBy: String,
  },
  lifecycleHistory: [{ status: String, at: { type: Date, default: Date.now }, reason: String }],
}, { timestamps: true });

meetingSchema.index({ userId: 1, leadId: 1, createdAt: -1 });
meetingSchema.index({ conversationId: 1, status: 1 });
meetingSchema.index({ userId: 1, conversationId: 1, status: 1 });
meetingSchema.index({ userId: 1, scheduledAt: 1, status: 1 });
meetingSchema.index({ userId: 1, scheduledFor: 1, status: 1 });
meetingSchema.index({ reservationKey: 1 }, { sparse: true, unique: true });
meetingSchema.index({ bookingToken: 1 }, { sparse: true, unique: true });
export default mongoose.model('Meeting', meetingSchema);
