import mongoose, { Schema } from 'mongoose';
import {
  externalLaunchEventStates,
  externalLaunchEventTypes,
  externalLaunchProviders,
  verificationStatuses,
} from '../types/launchExternalEvent';
import { evidenceTypes, launchChannels } from '../types/launch';

const schema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    schemaVersion: { type: Number, enum: [1], required: true },
    provider: { type: String, enum: externalLaunchProviders, required: true },
    eventType: { type: String, enum: externalLaunchEventTypes, required: true },
    externalEventId: { type: String, required: true, maxlength: 300 },
    channel: { type: String, enum: launchChannels, required: true },
    externalAccountId: { type: String, required: true, maxlength: 300 },
    externalParticipantId: { type: String, maxlength: 300 },
    providerTimestamp: { type: Date, required: true },
    receivedAt: { type: Date, required: true },
    verification: {
      status: { type: String, enum: verificationStatuses, required: true },
      method: String,
      timestampToleranceMs: Number,
    },
    correlationKey: { type: String, required: true, maxlength: 600 },
    payloadFingerprint: { type: String, required: true, maxlength: 64 },
    normalizedPayload: {
      launchId: { type: Schema.Types.ObjectId, ref: 'Launch' },
      participantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant' },
      leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
      conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
      attendanceStatus: { type: String, enum: ['attended', 'no_show'] },
      registrationStatus: { type: String, enum: ['registered'] },
      confirmationStatus: { type: String, enum: ['confirmed'] },
      contentType: {
        type: String,
        enum: ['comment', 'direct_message', 'form', 'provider_event', 'click'],
      },
      referenceId: { type: String, maxlength: 300 },
    },
    evidence: {
      type: { type: String, enum: evidenceTypes, required: true },
      source: String,
      channel: { type: String, enum: launchChannels },
      referenceId: String,
      recordedBy: String,
      occurredAt: Date,
      note: String,
      metadata: Schema.Types.Mixed,
    },
    metadata: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: externalLaunchEventStates, default: 'received', required: true },
    attempts: { type: Number, default: 0 },
    lastAttemptAt: Date,
    processedAt: Date,
    ignoredAt: Date,
    pendingReviewAt: Date,
    failedAt: Date,
    association: {
      launchId: { type: Schema.Types.ObjectId, ref: 'Launch' },
      participantId: { type: Schema.Types.ObjectId, ref: 'LaunchParticipant' },
      leadId: { type: Schema.Types.ObjectId, ref: 'Lead' },
      conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation' },
      resolution: { type: String, enum: ['explicit_ids', 'unresolved'] },
      reason: String,
    },
    result: {
      operation: String,
      state: String,
      launchEventId: { type: Schema.Types.ObjectId, ref: 'LaunchEvent' },
    },
    error: { code: String, message: String },
  },
  { timestamps: true }
);
schema.index(
  { userId: 1, provider: 1, externalAccountId: 1, externalEventId: 1 },
  { unique: true }
);
schema.index({ userId: 1, correlationKey: 1 }, { unique: true });
schema.index({ userId: 1, status: 1, receivedAt: -1 });
export default mongoose.model('LaunchExternalEvent', schema);
