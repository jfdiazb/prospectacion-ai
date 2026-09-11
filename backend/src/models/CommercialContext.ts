import mongoose, { Schema } from 'mongoose';

const intentTermsSchema = new Schema({
  intent: { type: String, required: true, trim: true },
  phrases: { type: [String], default: [] },
  tags: { type: [String], default: [] },
}, { _id: false });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  brandName: { type: String, required: true, trim: true, maxlength: 120 },
  description: { type: String, default: '', maxlength: 2000 },
  businessType: { type: String, default: '', maxlength: 120 },
  commercialLines: { type: [String], default: [] },
  categories: { type: [String], default: [] },
  productFamilies: { type: [String], default: [] },
  targetProfiles: { type: [Schema.Types.Mixed], default: [] },
  intentTerms: { type: [intentTermsSchema], default: [] },
  qualificationCriteria: { type: [String], default: [] },
  communicationRules: { type: [String], default: [] },
  allowedInformation: { type: [String], default: [] },
  informationPendingConfirmation: { type: [String], default: [] },
  restrictions: { type: [String], default: [] },
  disclaimers: { type: [String], default: [] },
  version: { type: Number, min: 1, default: 1 },
  status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
}, { timestamps: true });

schema.index({ userId: 1, status: 1 });
schema.index({ userId: 1, brandName: 1, version: 1 }, { unique: true });
schema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'active' } });

export default mongoose.model('CommercialContext', schema);
