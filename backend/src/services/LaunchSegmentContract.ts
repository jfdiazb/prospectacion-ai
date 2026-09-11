import { segmentFields, segmentOperators, type SegmentGroup, type SegmentRule, type TargetSegmentDefinition } from '../types/launch';
import { LaunchDomainError } from './LaunchDomainError';

const MAX_DEPTH = 3, MAX_RULES = 30, MAX_GROUPS = 10;
const numeric = new Set(['score', 'recent_activity_days', 'last_contact_days']);
const boolean = new Set(['product_interest', 'business_interest', 'income_need', 'commercial_experience', 'active_meeting', 'previous_participation']);

export class LaunchSegmentContract {
  static validate(input: unknown): TargetSegmentDefinition {
    const definition = input as TargetSegmentDefinition; if (!definition || definition.schemaVersion !== 1 || !['AND', 'OR'].includes(definition.logic)) throw new LaunchDomainError('Contrato de segmento inválido', 'INVALID_SEGMENT');
    let rules = 0, groups = 0;
    const visitRule = (rule: SegmentRule) => { rules++; if (!rule?.id?.trim() || !segmentFields.includes(rule.field) || !segmentOperators.includes(rule.operator)) throw new LaunchDomainError('Regla de segmento no permitida', 'INVALID_SEGMENT_RULE'); if (numeric.has(rule.field) && !['gte', 'lte', 'eq', 'neq', 'exists'].includes(rule.operator)) throw new LaunchDomainError('Operador inválido para campo numérico', 'INVALID_SEGMENT_OPERATOR'); if (boolean.has(rule.field) && !['eq', 'neq', 'exists'].includes(rule.operator)) throw new LaunchDomainError('Operador inválido para campo booleano', 'INVALID_SEGMENT_OPERATOR'); if (rule.operator === 'in' && !Array.isArray(rule.value)) throw new LaunchDomainError('El operador in requiere una lista', 'INVALID_SEGMENT_VALUE'); };
    const visit = (group: Pick<SegmentGroup, 'logic' | 'rules' | 'groups'>, depth: number) => { if (depth > MAX_DEPTH || !['AND', 'OR'].includes(group.logic) || !Array.isArray(group.rules) || !Array.isArray(group.groups || [])) throw new LaunchDomainError('Complejidad de segmento inválida', 'INVALID_SEGMENT_COMPLEXITY'); group.rules.forEach(visitRule); for (const child of group.groups || []) { groups++; visit(child, depth + 1); } };
    visit(definition, 1); if (!rules || rules > MAX_RULES || groups > MAX_GROUPS) throw new LaunchDomainError('El segmento debe tener entre 1 y 30 reglas y máximo 10 grupos', 'INVALID_SEGMENT_COMPLEXITY');
    return JSON.parse(JSON.stringify(definition));
  }
}
