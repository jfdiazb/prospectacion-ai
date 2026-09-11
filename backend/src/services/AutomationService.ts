import AutomationFlow from '../models/AutomationFlow';
import AutomationExecution from '../models/AutomationExecution';
import { CommercialContextService } from './CommercialContextService';

const statuses = ['draft', 'active', 'paused', 'disabled', 'error'];
const triggers = ['lead.created', 'message.received', 'keyword.detected', 'lead.score_changed', 'lead.status_changed', 'lead.qualification_changed', 'conversation.updated', 'followup.due', 'meeting.intent_detected', 'meeting.requested', 'meeting.confirmed', 'meeting.failed', 'meeting.completed', 'meeting.reminder_due', 'meeting.no_show', 'meeting.followup_due'];
const actions = ['create_or_update_lead', 'add_tag', 'change_status', 'update_score', 'generate_ai_response', 'create_proposal', 'create_task', 'suggest_followup', 'mark_meeting_candidate', 'add_note', 'wait'];
const fields = ['leadId', 'platform', 'source', 'keyword', 'score', 'interestLevel', 'status', 'tags', 'intent', 'normalizedIntent', 'normalizedIntents', 'commercialContextId', 'meetingIntent', 'lastInteractionAt', 'targetProfile', 'affinities'];
const operators = ['eq', 'neq', 'contains', 'in', 'gte', 'lte', 'exists', 'elapsed_gte'];

export class AutomationService {
  static normalizeKeyword(value: string) { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim(); }
  static textMatchesKeyword(text: string, keyword: string) { const normalizedText = this.normalizeKeyword(text); const normalizedKeyword = this.normalizeKeyword(keyword); if (!normalizedKeyword) return false; const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, 'u').test(normalizedText); }
  static async findMatchingKeywordFlow(userId: string, text: string): Promise<any | null> { const flows: any[] = await AutomationFlow.find({ userId, $or: [{ status: 'active' }, { isActive: true }], 'trigger.type': { $in: ['keyword', 'keyword.detected'] } }).sort({ createdAt: 1 }); return flows.find((flow: any) => [...(flow.trigger?.keywords ?? []), flow.trigger?.keyword].filter(Boolean).some((keyword: string) => this.textMatchesKeyword(text, keyword))) ?? null; }
  static getReply(flow: any) { const action = flow?.actions?.find((item: any) => ['send_message', 'create_proposal'].includes(item.type) && (item.message?.trim() || item.config?.message?.trim())); return action?.config?.message?.trim() ?? action?.message?.trim() ?? null; }

  static sanitize(input: any, partial = false) {
    const output: any = {};
    if (!partial || input.name != null) { output.name = String(input.name ?? '').trim(); if (output.name.length < 3 || output.name.length > 120) throw new Error('El nombre debe tener entre 3 y 120 caracteres'); }
    if (input.description != null) output.description = String(input.description).trim().slice(0, 500);
    if (!partial || input.trigger != null) { const trigger = input.trigger ?? {}; const type = trigger.type === 'keyword' ? 'keyword.detected' : String(trigger.type ?? ''); if (!triggers.includes(type)) throw new Error('Trigger no permitido'); output.trigger = { type, keyword: trigger.keyword ? String(trigger.keyword).trim().slice(0, 100) : undefined, keywords: Array.isArray(trigger.keywords) ? trigger.keywords.slice(0, 20).map((v: unknown) => String(v).trim().slice(0, 100)).filter(Boolean) : undefined, platform: trigger.platform ? String(trigger.platform) : undefined }; if (type === 'keyword.detected' && !output.trigger.keyword && !output.trigger.keywords?.length) throw new Error('El trigger keyword.detected requiere una palabra clave'); }
    if (input.status != null) { if (!statuses.includes(input.status)) throw new Error('Estado no permitido'); output.status = input.status; output.isActive = input.status === 'active'; }
    if (input.conditionLogic != null) { if (!['AND', 'OR'].includes(input.conditionLogic)) throw new Error('La lógica debe ser AND u OR'); output.conditionLogic = input.conditionLogic; }
    if (input.conditions != null) { if (!Array.isArray(input.conditions) || input.conditions.length > 20) throw new Error('Condiciones inválidas'); output.conditions = input.conditions.map((item: any) => { if (!fields.includes(item.field) || !operators.includes(item.operator)) throw new Error('Condición no permitida'); return { field: item.field, operator: item.operator, value: item.value }; }); }
    if (!partial || input.actions != null) { if (!Array.isArray(input.actions) || !input.actions.length || input.actions.length > 30) throw new Error('Debe existir entre 1 y 30 acciones'); output.actions = input.actions.map((item: any) => { const type = item.type === 'send_message' ? 'create_proposal' : item.type === 'delay' ? 'wait' : item.type; if (!actions.includes(type)) throw new Error(`Acción no permitida: ${type}`); const actionConditions = Array.isArray(item.conditions) ? item.conditions.map((condition: any) => { if (!fields.includes(condition.field) || !operators.includes(condition.operator)) throw new Error('Condición de acción no permitida'); return { field: condition.field, operator: condition.operator, value: condition.value }; }) : []; return { type, config: typeof item.config === 'object' && item.config ? item.config : item.message ? { message: String(item.message).slice(0, 1000) } : item.delay != null ? { durationMs: Number(item.delay) } : {}, conditions: actionConditions }; }); }
    return output;
  }

  static async createFlow(userId: string, data: any) { const clean = this.sanitize(data); const context: any = await CommercialContextService.getActive(userId); return AutomationFlow.create({ ...clean, userId, commercialContextId: context?._id, status: clean.status ?? 'draft', isActive: clean.status === 'active', version: 1 }); }
  static async getUserFlows(userId: string, filters: any = {}) { await Promise.all([AutomationFlow.updateMany({ userId, status: { $exists: false }, isActive: true }, { $set: { status: 'active' } }), AutomationFlow.updateMany({ userId, status: { $exists: false }, isActive: { $ne: true } }, { $set: { status: 'paused' } })]); const query: any = { userId }; if (filters.status && statuses.includes(filters.status)) query.status = filters.status; if (filters.trigger && triggers.includes(filters.trigger)) query['trigger.type'] = filters.trigger; if (filters.search) query.name = { $regex: String(filters.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' }; return AutomationFlow.find(query).sort({ createdAt: -1 }); }
  static async getFlowById(id: string, userId: string) { return AutomationFlow.findOne({ _id: id, userId }); }
  static async updateFlow(id: string, userId: string, data: any) { const clean = this.sanitize(data, true); return AutomationFlow.findOneAndUpdate({ _id: id, userId }, { $set: clean, $inc: { version: 1 } }, { new: true, runValidators: true }); }
  static async deleteFlow(id: string, userId: string) { const result = await AutomationFlow.deleteOne({ _id: id, userId }); return result.deletedCount > 0; }
  static async setStatus(id: string, userId: string, status: string) { if (!statuses.includes(status)) throw new Error('Estado no permitido'); return AutomationFlow.findOneAndUpdate({ _id: id, userId }, { $set: { status, isActive: status === 'active' }, $inc: { version: 1 } }, { new: true }); }
  static async toggleFlow(id: string, userId: string) { const flow: any = await this.getFlowById(id, userId); if (!flow) throw new Error('Flow no encontrado'); return this.setStatus(id, userId, flow.status === 'active' || flow.isActive ? 'paused' : 'active'); }
  static async duplicateFlow(id: string, userId: string) { const flow: any = await this.getFlowById(id, userId); if (!flow) return null; const copy = flow.toObject(); delete copy._id; delete copy.createdAt; delete copy.updatedAt; delete copy.templateKey; return AutomationFlow.create({ ...copy, userId, name: `${flow.name} (copia)`.slice(0, 120), status: 'draft', isActive: false, version: 1, lastRunAt: undefined, executionStats: {} }); }
  static async history(id: string, userId: string) { if (!await AutomationFlow.exists({ _id: id, userId })) return null; return AutomationExecution.find({ automationId: id, userId }).sort({ startedAt: -1 }).limit(100); }
  static async recordExecution(id: string, userId: string, successful: boolean) { await AutomationFlow.updateOne({ _id: id, userId }, { $inc: { 'executionStats.totalExecutions': 1, [`executionStats.${successful ? 'successfulExecutions' : 'failedExecutions'}`]: 1 }, $set: { lastRunAt: new Date(), 'executionStats.lastExecution': new Date() } }); }
  static async ensureInfoTemplate(userId: string) { return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'info_qualification_v1' }, { $setOnInsert: { userId, templateKey: 'info_qualification_v1', name: 'INFO → Calificación', description: 'Plantilla multicanal asistida: califica, propone respuesta y sugiere seguimiento.', status: 'draft', isActive: false, version: 1, trigger: { type: 'keyword.detected', keyword: 'INFO', keywords: ['INFO'] }, conditionLogic: 'AND', conditions: [], actions: [{ type: 'add_tag', config: { tag: 'INFO' } }, { type: 'generate_ai_response', config: {} }, { type: 'wait', config: { durationMs: 86400000 } }, { type: 'update_score', config: { score: 65 } }, { type: 'change_status', config: { status: 'interested' } }, { type: 'suggest_followup', config: {} }] } }, { upsert: true, new: true }); }
  static async ensureAdditionalIncomeTemplate(userId: string) {
    const context: any = await CommercialContextService.getActive(userId);
    return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'additional_income_assisted_qualification_v1' }, { $setOnInsert: {
      userId, commercialContextId: context?._id, templateKey: 'additional_income_assisted_qualification_v1', name: 'Ingresos adicionales → Calificación asistida',
      description: 'Continúa el descubrimiento de prospectos con interés semántico en ingresos adicionales y conserva la aprobación humana.',
      status: 'draft', isActive: false, version: 1, trigger: { type: 'message.received' }, conditionLogic: 'AND',
      conditions: [
        { field: 'leadId', operator: 'exists', value: true },
        { field: 'normalizedIntent', operator: 'eq', value: 'additional_income_interest' },
        { field: 'commercialContextId', operator: 'exists', value: true },
        { field: 'status', operator: 'neq', value: 'rejected' },
        { field: 'status', operator: 'in', value: ['new', 'contacted', 'conversation_started', 'follow_up', 'interested'] },
        { field: 'platform', operator: 'in', value: ['whatsapp', 'instagram', 'facebook'] },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'interes_ingresos_adicionales' } },
        { type: 'generate_ai_response', config: {} },
        { type: 'suggest_followup', config: { title: 'Revisar calificación por ingresos adicionales', description: 'Revisar la propuesta asistida y continuar el descubrimiento sin asumir negocio, producto o reunión.', priority: 'medium' } },
      ],
    } }, { upsert: true, new: true });
  }
  static async ensureProductInterestTemplate(userId: string) {
    const context: any = await CommercialContextService.getActive(userId);
    return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'product_interest_assisted_qualification_v1' }, { $setOnInsert: {
      userId, commercialContextId: context?._id, templateKey: 'product_interest_assisted_qualification_v1', name: 'Interés en productos → Calificación de consumo asistida',
      description: 'Descubre necesidades generales de consumo sin inferir salud, venta, negocio o reunión y conserva la revisión humana.',
      status: 'draft', isActive: false, version: 1, trigger: { type: 'message.received' }, conditionLogic: 'AND',
      conditions: [
        { field: 'leadId', operator: 'exists', value: true },
        { field: 'normalizedIntent', operator: 'eq', value: 'product_interest' },
        { field: 'commercialContextId', operator: 'exists', value: true },
        { field: 'status', operator: 'neq', value: 'rejected' },
        { field: 'status', operator: 'in', value: ['new', 'contacted', 'conversation_started', 'follow_up', 'interested'] },
        { field: 'platform', operator: 'in', value: ['whatsapp', 'instagram', 'facebook'] },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'interes_productos' } },
        { type: 'generate_ai_response', config: {} },
        { type: 'suggest_followup', config: { title: 'Revisar interés de consumo en productos', description: 'Revisar la propuesta asistida y aclarar categoría o necesidad general sin hacer afirmaciones médicas ni asumir venta o negocio.', priority: 'medium' } },
      ],
    } }, { upsert: true, new: true });
  }
  static async ensureProductSalesTemplate(userId: string) {
    const context: any = await CommercialContextService.getActive(userId);
    return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'product_sales_interest_assisted_qualification_v1' }, { $setOnInsert: {
      userId, commercialContextId: context?._id, templateKey: 'product_sales_interest_assisted_qualification_v1', name: 'Interés en venta de productos → Calificación comercial asistida',
      description: 'Califica el interés declarado en comercializar productos sin prometer ingresos, inferir experiencia, convertirlo en oportunidad de negocio ni crear reuniones.',
      status: 'draft', isActive: false, version: 1, trigger: { type: 'message.received' }, conditionLogic: 'AND',
      conditions: [
        { field: 'leadId', operator: 'exists', value: true },
        { field: 'normalizedIntent', operator: 'eq', value: 'product_sales_interest' },
        { field: 'commercialContextId', operator: 'exists', value: true },
        { field: 'status', operator: 'neq', value: 'rejected' },
        { field: 'status', operator: 'in', value: ['new', 'contacted', 'conversation_started', 'follow_up', 'interested'] },
        { field: 'platform', operator: 'in', value: ['whatsapp', 'instagram', 'facebook'] },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'interes_venta_productos' } },
        { type: 'generate_ai_response', config: {} },
        { type: 'suggest_followup', config: { title: 'Revisar interés en venta de productos', description: 'Revisar la propuesta asistida y explorar experiencia, canales y objetivos sin prometer ingresos ni asumir interés en construir un negocio.', priority: 'medium' } },
      ],
    } }, { upsert: true, new: true });
  }
  static async ensureBusinessOpportunityTemplate(userId: string) {
    const context: any = await CommercialContextService.getActive(userId);
    return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'business_opportunity_assisted_qualification_v1' }, { $setOnInsert: {
      userId, commercialContextId: context?._id, templateKey: 'business_opportunity_assisted_qualification_v1', name: 'Oportunidad de negocio → Calificación asistida',
      description: 'Califica interés explícito en desarrollar una oportunidad de negocio sin presentarla como empleo, prometer resultados ni inferir reunión.',
      status: 'draft', isActive: false, version: 1, trigger: { type: 'message.received' }, conditionLogic: 'AND',
      conditions: [
        { field: 'leadId', operator: 'exists', value: true },
        { field: 'normalizedIntent', operator: 'eq', value: 'business_opportunity' },
        { field: 'commercialContextId', operator: 'exists', value: true },
        { field: 'status', operator: 'neq', value: 'rejected' },
        { field: 'status', operator: 'in', value: ['new', 'contacted', 'conversation_started', 'follow_up', 'interested'] },
        { field: 'platform', operator: 'in', value: ['whatsapp', 'instagram', 'facebook'] },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'interes_oportunidad_negocio' } },
        { type: 'generate_ai_response', config: {} },
        { type: 'suggest_followup', config: { title: 'Revisar interés en oportunidad de negocio', description: 'Revisar la propuesta asistida y profundizar en objetivos y experiencia sin presentar la oportunidad como empleo ni prometer ingresos o resultados.', priority: 'medium' } },
      ],
    } }, { upsert: true, new: true });
  }
  static async ensureBusinessProductTemplate(userId: string) {
    const context: any = await CommercialContextService.getActive(userId);
    return AutomationFlow.findOneAndUpdate({ userId, templateKey: 'business_product_assisted_qualification_v1' }, { $setOnInsert: {
      userId, commercialContextId: context?._id, templateKey: 'business_product_assisted_qualification_v1', name: 'Interés combinado → Calificación asistida',
      description: 'Aclara si el prospecto desea priorizar productos o la oportunidad de negocio sin descartar el otro interés, prometer resultados ni inferir una reunión.',
      status: 'draft', isActive: false, version: 1, trigger: { type: 'message.received' }, conditionLogic: 'AND',
      conditions: [
        { field: 'leadId', operator: 'exists', value: true },
        { field: 'normalizedIntent', operator: 'eq', value: 'business_and_product_interest' },
        { field: 'commercialContextId', operator: 'exists', value: true },
        { field: 'status', operator: 'neq', value: 'rejected' },
        { field: 'status', operator: 'in', value: ['new', 'contacted', 'conversation_started', 'follow_up', 'interested'] },
        { field: 'platform', operator: 'in', value: ['whatsapp', 'instagram', 'facebook'] },
      ],
      actions: [
        { type: 'add_tag', config: { tag: 'interes_negocio_y_productos' } },
        { type: 'generate_ai_response', config: {} },
        { type: 'suggest_followup', config: { title: 'Revisar interés combinado', description: 'Revisar la propuesta asistida, aclarar qué interés desea priorizar y conservar las señales de productos y negocio.', priority: 'medium' } },
      ],
    } }, { upsert: true, new: true });
  }
}
