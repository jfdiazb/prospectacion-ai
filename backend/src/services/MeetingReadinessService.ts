import { MeetingLifecycleService } from './MeetingLifecycleService';

export type MeetingReadiness = {
  ready: boolean;
  reason: 'explicit_request' | 'explicit_acceptance' | 'qualified_discovery' | 'needs_discovery';
  evidence: string[];
  launchId?: string;
  launchParticipantId?: string;
};

type ConversationTurn = { sender: 'lead' | 'ai' | 'user'; text: string };

const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es');

export class MeetingReadinessService {
  static shouldStartScheduling(readiness: MeetingReadiness): boolean {
    return readiness.reason === 'explicit_request' || readiness.reason === 'explicit_acceptance';
  }

  static explicitlyAcceptedMeeting(current: string, conversation: ConversationTurn[] = []): boolean {
    const affirmative = normalize(current).replace(/[^a-z0-9]+/g, ' ').trim();
    if (!/^(si|si por favor|claro|claro que si|de acuerdo|ok|vale|por supuesto|me gustaria|hagamoslo)$/.test(affirmative)) {
      return false;
    }
    const currentIndex = [...conversation].map(turn => turn.text).lastIndexOf(current);
    const preceding = currentIndex >= 0 ? conversation.slice(0, currentIndex) : conversation;
    const previousAI = [...preceding].reverse().find(turn => turn.sender === 'ai' || turn.sender === 'user');
    if (!previousAI) return false;
    const question = normalize(previousAI.text);
    return /\b(quieres|deseas|aceptas|te gustaria|podemos)\b.{0,90}\b(agend(?:ar|emos)|program(?:ar|emos)|reserv(?:ar|emos)|coordin(?:ar|emos))\b.{0,60}\b(reunion|llamada|cita|asesoria)\b|\b(agendamos|programamos|reservamos|coordinamos)\b.{0,60}\b(reunion|llamada|cita|asesoria)\b/.test(question);
  }

  static evaluate(
    leadTexts: string[],
    qualification: any,
    attribution?: { launchId: string; participantId: string },
    conversationTurns: ConversationTurn[] = []
  ): MeetingReadiness {
    const current = leadTexts.at(-1) ?? '';

    // Solo considera solicitud explícita cuando realmente existe
    // intención de agendar una reunión.
    if (MeetingLifecycleService.hasSufficientIntent(current)) {
      return {
        ready: true,
        reason: 'explicit_request',
        evidence: ['explicit_meeting_intent'],
        launchId: attribution?.launchId,
        launchParticipantId: attribution?.participantId,
      };
    }

    if (this.explicitlyAcceptedMeeting(current, conversationTurns)) {
      return {
        ready: true,
        reason: 'explicit_acceptance',
        evidence: ['explicit_meeting_acceptance'],
        launchId: attribution?.launchId,
        launchParticipantId: attribution?.participantId,
      };
    }

    const conversation = normalize(leadTexts.join(' '));
    const evidence = new Set<string>();

    const normalizedIntent = String(
      qualification?.normalizedIntent || 'undetermined'
    );

    if (
      normalizedIntent !== 'undetermined' &&
      normalizedIntent !== 'rejection' &&
      normalizedIntent !== 'meeting'
    ) {
      evidence.add('declared_interest');
    }
    if (/\b(me interesa|quiero conocer|oportunidad de negocio|ingresos? adicionales?|productos?|vender)\b/.test(conversation)) {
      evidence.add('declared_interest');
    }

    if (
      qualification?.signals?.need >= 70 ||
      /\b(necesito|busco|quiero (?:aprender|mejorar|lograr|conseguir|generar)|mi objetivo|mi meta|me cuesta|dificultad|problema)\b/.test(
        conversation
      )
    ) {
      evidence.add('declared_need_or_goal');
    }

    if (
      /\b(ya (?:vendo|trabajo|tengo|hago)|tengo (?:un )?negocio|estoy empezando|desde cero|sin experiencia|nunca he|actualmente|por redes|clientes|prospectos|seguimiento|cierre)\b/.test(
        conversation
      )
    ) {
      evidence.add('prospect_context');
    }

    if (
      leadTexts.length >= 2 &&
      evidence.has('declared_need_or_goal') &&
      evidence.has('prospect_context')
    ) {
      evidence.add('discovery_conversation');
    }

    if (/\b(me gustaria|quiero|estoy dispuesto|estoy abierta|estoy abierto|podemos)\b.{0,45}\b(siguiente paso|solucion|alternativa|opcion|como empezar|como avanzar|que me expliques)\b|\b(siguiente paso|como puedo empezar|como puedo avanzar)\b/.test(conversation)) {
      evidence.add('next_step_openness');
    }

    if (
      leadTexts.length >= 3 &&
      evidence.has('declared_interest') &&
      evidence.has('declared_need_or_goal') &&
      evidence.has('prospect_context')
    ) {
      evidence.add('sustained_engagement');
    }

    // La preparación se determina por la calidad de la conversación,
    // no por exigir arbitrariamente 10 mensajes.
    const qualified =
      evidence.has('declared_interest') &&
      evidence.has('declared_need_or_goal') &&
      evidence.has('prospect_context') &&
      evidence.has('discovery_conversation') &&
      (evidence.has('next_step_openness') || evidence.has('sustained_engagement'));

    return {
      ready: qualified,
      reason: qualified ? 'qualified_discovery' : 'needs_discovery',
      evidence: [...evidence],
      launchId: attribution?.launchId,
      launchParticipantId: attribution?.participantId,
    };
  }
}
