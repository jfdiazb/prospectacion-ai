import mongoose, { Schema } from 'mongoose';
import { launchChannels, launchStatuses } from '../types/launch';

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, trim: true, maxlength: 2000 },
  typeKey: { type: String, default: 'generic', trim: true, maxlength: 80 },
  objective: { type: String, trim: true, maxlength: 1000 },
  status: { type: String, enum: launchStatuses, default: 'draft', required: true },
  timezone: { type: String, required: true, trim: true, maxlength: 100 },
  startsAt: Date, eventStartsAt: Date, eventEndsAt: Date, closesAt: Date,
  targetSegment: { schemaVersion: Number, logic: { type: String, enum: ['AND', 'OR'] }, rules: { type: [Schema.Types.Mixed], default: [] }, groups: { type: [Schema.Types.Mixed], default: [] } },
  targetSegmentVersion: { type: Number, default: 0, min: 0 },
  selectionMode: { type: String, enum: ['manual', 'assisted'], default: 'manual' },
  allowedChannels: [{ type: String, enum: launchChannels }],
  registrationConfig: { type: Schema.Types.Mixed, default: {} },
  followUpConfig: { type: Schema.Types.Mixed, default: {} },
  metricsConfig: { type: Schema.Types.Mixed, default: {} },
  commercialContextId: { type: Schema.Types.ObjectId, ref: 'CommercialContext' },
  configurationVersion: { type: Number, default: 1, min: 1 },
  lifecycleVersion: { type: Number, default: 1, min: 1 },
  creationKey: { type: String, required: true },
  createdBy: { type: String, required: true, maxlength: 120 },
  lastTransitionAt: Date, cancelledAt: Date, completedAt: Date,
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

schema.index({ userId: 1, status: 1, eventStartsAt: 1 });
schema.index({ userId: 1, createdAt: -1 });
schema.index({ userId: 1, creationKey: 1 }, { unique: true });
export default mongoose.model('Launch', schema);
