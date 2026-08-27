import mongoose, { Schema } from 'mongoose';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  leadId: { type: Schema.Types.ObjectId, ref: 'Lead', required: true },
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  sourceEventId: { type: String, required: true },
  platform: { type: String, enum: ['whatsapp', 'instagram', 'facebook'], default: 'whatsapp', required: true },
  recipient: {
    type: { type: String, enum: ['whatsapp_user', 'instagram_user', 'instagram_comment', 'facebook_user', 'facebook_comment'] },
    externalId: String,
  },
  text: { type: String, required: true, maxlength: 1000 },
  originalText: { type: String, required: true, maxlength: 1000 },
  purpose: { type: String, enum: ['conversation_response', 'follow_up', 'reactivation', 'automation', 'meeting_scheduling', 'meeting_reminder', 'meeting_followup', 'launch_action'], default: 'conversation_response' },
  contextSnapshot: {
    leadStatus: String,
    channel: String,
    conversationLastMessageAt: Date,
    lastLeadMessageId: String,
    qualificationEvaluatedAt: Date,
    meetingId: String,
    meetingStatus: String,
    meetingScheduledFor: Date,
    launchId: String,
    launchParticipantId: String,
    launchActionId: String,
    launchStatus: String,
    launchConfigurationVersion: Number,
    launchEventStartsAt: Date,
    participantLifecycleVersion: Number,
    participantStage: String,
    participantInvitation: String,
    participantRegistration: String,
    participantConfirmation: String,
    participantAttendance: String,
    participantOutcome: String,
  },
  expiresAt: Date,
  invalidatedAt: Date,
  invalidationReason: String,
  status: { type: String, enum: ['proposed', 'sending', 'sent', 'failed', 'cancelled'], default: 'proposed' },
  editedAt: Date, approvedAt: Date, sentAt: Date, failedAt: Date,
  deliveryStatus: String, errorMessage: String,
  outboundMessageId: { type: Schema.Types.ObjectId, ref: 'OutboundMessage' },
}, { timestamps: true, collection: 'whatsappproposals' });
schema.index({ userId: 1, conversationId: 1, createdAt: -1 });
schema.index({ userId: 1, sourceEventId: 1 }, { unique: true });

export default mongoose.models.AssistedProposal || mongoose.model('AssistedProposal', schema);
