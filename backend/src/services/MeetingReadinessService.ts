import { MeetingLifecycleService } from './MeetingLifecycleService';

export type MeetingReadiness = {
  ready: boolean;
  reason: 'explicit_request' | 'explicit_acceptance' | 'qualified_discovery' | 'meeting_declined' | 'needs_discovery';
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
    return this.isExplicitMeetingOffer(question);
  }

  static isExplicitMeetingOffer(text: string): boolean {
    const normalized = normalize(text);
    return /\b(quieres|deseas|aceptas|te gustaria|podemos)\b.{0,90}\b(agend(?:ar|emos|aramos)|program(?:ar|emos|aramos)|reserv(?:ar|emos|aramos)|coordin(?:ar|emos|aramos))\b.{0,60}\b(reunion|llamada|cita|asesoria)\b|\b(agendamos|programamos|reservamos|coordinamos)\b.{0,60}\b(reunion|llamada|cita|asesoria)\b/.test(normalized);
  }

  static shouldOfferMeeting(readiness: MeetingReadiness, conversation: ConversationTurn[] = []): boolean {
    return readiness.reason === 'qualified_discovery' &&
      !conversation.some(turn => (turn.sender === 'ai' || turn.sender === 'user') && this.isExplicitMeetingOffer(turn.text));
  }

  static meetingOffer(leadTexts: string[] = []): string {
    const context = normalize(leadTexts.join(' '));
    const focus = /redes sociales|facebook|instagram|whatsapp/.test(context) && /inteligencia artificial|\bia\b/.test(context)
      ? 'cómo aprovechar tus redes sociales y la inteligencia artificial para desarrollar una actividad comercial'
      : /ingresos? adicionales?|tiempos libres|horas? semanales?/.test(context)
        ? 'cómo desarrollar una actividad comercial alineada con tus objetivos y el tiempo que tienes disponible'
        : 'cómo aprovechar tus recursos e intereses para desarrollar esta actividad';
    return `¡Excelente! Con lo que me cuentas, podemos explorar ${focus}. ¿Te gustaría que programáramos una reunión para explicarte cómo funciona?`;
  }

  static meetingOfferFor(readiness: MeetingReadiness, conversation: ConversationTurn[] = [], leadTexts: string[] = []): string | undefined {
    return this.shouldOfferMeeting(readiness, conversation) ? this.meetingOffer(leadTexts) : undefined;
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

    const previousAI = [...conversationTurns].reverse().find(turn => turn.sender === 'ai' || turn.sender === 'user');
    if (
      previousAI &&
      this.isExplicitMeetingOffer(previousAI.text) &&
      /^(no|no gracias|prefiero|ahora no|todavia no)\b/.test(normalize(current).replace(/[^a-z0-9]+/g, ' ').trim())
    ) {
      return {
        ready: false,
        reason: 'meeting_declined',
        evidence: ['explicit_meeting_decline'],
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
      /\b(ya (?:vendo|trabajo|tengo|hago)|tengo (?:un )?negocio|estoy empezando|desde cero|(?:poca|algo de|sin) experiencia|nunca he|actualmente|por redes|redes sociales|facebook|instagram|whatsapp|inteligencia artificial|\d+ horas? semanales?|tiempos libres|clientes|prospectos|seguimiento|cierre)\b/.test(
        conversation
      )
    ) {
      evidence.add('prospect_context');
    }

    const currentTurn = normalize(current);
    const singleTurnDimensions = [
      /\b(?:meta|objetivo|ganar|generar|ingresos?)\b.{0,45}(?:\$|cop|pesos?)?\s*\d[\d.,]*|(?:\$|cop|pesos?)\s*\d[\d.,]*.{0,45}\b(?:mes|mensual|ingresos?)\b/.test(currentTurn),
      /\b\d+(?:[.,]\d+)?\s*horas?\s*(?:por|a la)?\s*seman(?:a|ales)\b|\btiempo(?:s)? libres?\b/.test(currentTurn),
      /\b(?:redes sociales|facebook|instagram|whatsapp|inteligencia artificial|\bia\b)\b/.test(currentTurn),
      /\b(?:poca|algo de|sin|mucha) experiencia\b|\b(?:ya vendo|he vendido|nunca he vendido)\b/.test(currentTurn),
    ].filter(Boolean).length;
    if (
      leadTexts.length === 1 &&
      evidence.has('declared_interest') &&
      evidence.has('declared_need_or_goal') &&
      evidence.has('prospect_context') &&
      singleTurnDimensions >= 3
    ) {
      evidence.add('comprehensive_single_turn');
    }

    if (
      (leadTexts.length >= 2 || evidence.has('comprehensive_single_turn')) &&
      evidence.has('declared_need_or_goal') &&
      evidence.has('prospect_context')
    ) {
      evidence.add('discovery_conversation');
    }

    if (/\b(me gustaria|quiero|estoy dispuesto|estoy abierta|estoy abierto|podemos)\b.{0,45}\b(siguiente paso|solucion|alternativa|opcion|como empezar|como avanzar|que me expliques)\b|\b(siguiente paso|como puedo empezar|como puedo avanzar)\b/.test(conversation)) {
      evidence.add('next_step_openness');
    }
    if (/\b(quiero|me gustaria|necesito)\b.{0,55}\b(aprender|orientacion|orientarme|conocer como funciona|saber como funciona|empezar)\b/.test(conversation)) {
      evidence.add('guidance_interest');
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
      (evidence.has('next_step_openness') || evidence.has('guidance_interest') || evidence.has('sustained_engagement'));

    return {
      ready: qualified,
      reason: qualified ? 'qualified_discovery' : 'needs_discovery',
      evidence: [...evidence],
      launchId: attribution?.launchId,
      launchParticipantId: attribution?.participantId,
    };
  }
}
