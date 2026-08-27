import mongoose, { Schema } from 'mongoose';

const conditionSchema = new Schema({ field: { type: String, required: true }, operator: { type: String, enum: ['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'exists', 'elapsed_gte'], required: true }, value: Schema.Types.Mixed }, { _id: false });
const actionSchema = new Schema({
  type: { type: String, enum: ['create_or_update_lead', 'add_tag', 'change_status', 'update_score', 'generate_ai_response', 'create_proposal', 'create_task', 'suggest_followup', 'mark_meeting_candidate', 'add_note', 'wait', 'send_message'], required: true },
  config: { type: Schema.Types.Mixed, default: {} }, message: String, delay: Number, conditions: [conditionSchema],
}, { _id: true });

const schema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  commercialContextId: { type: Schema.Types.ObjectId, ref: 'CommercialContext' },
  name: { type: String, required: true, trim: true, maxlength: 120 }, description: { type: String, maxlength: 500 },
  status: { type: String, enum: ['draft', 'active', 'paused', 'disabled', 'error'], default: 'draft', required: true },
  trigger: { type: { type: String, enum: ['lead.created', 'message.received', 'keyword.detected', 'lead.score_changed', 'lead.status_changed', 'lead.qualification_changed', 'conversation.updated', 'followup.due', 'meeting.intent_detected', 'meeting.requested', 'meeting.confirmed', 'meeting.failed', 'meeting.completed', 'meeting.reminder_due', 'meeting.no_show', 'meeting.followup_due', 'launch.action_due', 'keyword', 'comment', 'dm', 'schedule'], required: true }, keyword: String, keywords: [String], platform: String },
  conditionLogic: { type: String, enum: ['AND', 'OR'], default: 'AND' }, conditions: [conditionSchema], actions: [actionSchema],
  isActive: { type: Boolean, default: false }, version: { type: Number, default: 1 }, lastRunAt: Date,
  executionStats: { totalExecutions: { type: Number, default: 0 }, successfulExecutions: { type: Number, default: 0 }, failedExecutions: { type: Number, default: 0 }, lastExecution: Date, nextExecution: Date },
  templateKey: String,
}, { timestamps: true });
schema.pre('validate', function(next) { if (this.isModified('isActive') && !this.isModified('status')) this.status = this.isActive ? 'active' : 'paused'; else this.isActive = this.status === 'active'; next(); });
schema.index({ userId: 1, status: 1, 'trigger.type': 1 });
schema.index({ userId: 1, commercialContextId: 1 });
schema.index({ userId: 1, templateKey: 1 }, { unique: true, partialFilterExpression: { templateKey: { $type: 'string' } } });
export default mongoose.model('AutomationFlow', schema);
