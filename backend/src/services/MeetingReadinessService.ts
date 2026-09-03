import { MeetingLifecycleService } from './MeetingLifecycleService';

export type MeetingReadiness = {
  ready: boolean;
  reason: 'explicit_request' | 'qualified_discovery' | 'needs_discovery';
  evidence: string[];
  launchId?: string;
  launchParticipantId?: string;
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export class MeetingReadinessService {
  static evaluate(leadTexts: string[], qualification: any, attribution?: { launchId: string; participantId: string }): MeetingReadiness {
    const current = leadTexts.at(-1) ?? '';
    if (MeetingLifecycleService.hasSufficientIntent(current)) {
      return { ready: true, reason: 'explicit_request', evidence: ['explicit_meeting_intent'], launchId: attribution?.launchId, launchParticipantId: attribution?.participantId };
    }

    const conversation = normalize(leadTexts.join(' '));
    const evidence = new Set<string>();
    const normalizedIntent = String(qualification?.normalizedIntent || 'undetermined');
    if (normalizedIntent !== 'undetermined' && normalizedIntent !== 'rejection' && normalizedIntent !== 'meeting') evidence.add('declared_interest');
    if (qualification?.signals?.need >= 70 || /\b(necesito|busco|quiero (?:aprender|mejorar|lograr|conseguir|generar)|mi objetivo|mi meta|me cuesta|dificultad|problema)\b/.test(conversation)) evidence.add('declared_need_or_goal');
    if (/\b(ya (?:vendo|trabajo|tengo|hago)|tengo (?:un )?negocio|estoy empezando|desde cero|sin experiencia|nunca he|actualmente|por redes|clientes|prospectos|seguimiento|cierre)\b/.test(conversation)) evidence.add('prospect_context');
    if (/\b(me gustaria|quiero|estoy dispuesto|estoy abierta|estoy abierto|podemos)\b.{0,45}\b(siguiente paso|solucion|alternativa|opcion|como empezar|como avanzar|que me expliques)\b|\b(siguiente paso|como puedo empezar|como puedo avanzar)\b/.test(conversation)) evidence.add('next_step_openness');
    if (leadTexts.length >= 2 && evidence.has('declared_need_or_goal') && evidence.has('prospect_context')) evidence.add('discovery_conversation');
    if (leadTexts.length >= 3 && evidence.has('declared_interest') && evidence.has('declared_need_or_goal') && evidence.has('prospect_context')) evidence.add('sustained_engagement');

    const qualified = evidence.has('declared_interest')
      && evidence.has('declared_need_or_goal')
      && evidence.has('prospect_context')
      && evidence.has('discovery_conversation')
      && (evidence.has('next_step_openness') || evidence.has('sustained_engagement'));
    return { ready: qualified, reason: qualified ? 'qualified_discovery' : 'needs_discovery', evidence: [...evidence], launchId: attribution?.launchId, launchParticipantId: attribution?.participantId };
  }
}
