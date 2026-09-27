import Meeting from '../models/Meeting';
import type { MeetingReadiness } from './MeetingReadinessService';

type MeetingSnapshot = {
  status?: string;
  provider?: string;
  joinUrl?: string;
  bookingUrl?: string;
  scheduledAt?: Date;
  scheduledFor?: Date;
};

export type SafetyResult = {
  text: string;
  allowed: boolean;
  violations: string[];
  fallbackUsed: boolean;
};

const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export class ConversationalSafetyService {
  static readonly version = 'behavioral-commercial-v1';

  static detectPlaceholders(text: string): boolean {
    return /\{\{[^}]+\}\}|\$\{[^}]+\}|<(?:placeholder|todo|tbd|[^>]*variable[^>]*)>|\[(?:sector|servicio|producto|marca|variable|placeholder)(?:\/[^\]]+)?\]|\b(?:TODO|TBD)\b/i.test(text);
  }

  static isGenericInformationRequest(text: string): boolean {
    const value = normalize(text).replace(/[^a-z0-9]+/g, ' ').trim();
    return /^(?:info|informacion|quiero informacion|me interesa)$/.test(value);
  }

  static isFirstContactDiscovery(input: {
    isNewLead: boolean;
    currentMessage: string;
    hasPriorConversation: boolean;
    commercialMemory?: {
      interests?: string[]; needs?: string[]; objections?: string[]; meetingEvidence?: string[];
      commercialState?: string; meetingInterest?: string; bookingStatus?: string; bookingProvider?: string;
    } | null;
  }): boolean {
    const memory = input.commercialMemory;
    const hasMemory = Boolean(
      memory && (
        memory.interests?.length || memory.needs?.length || memory.objections?.length || memory.meetingEvidence?.length
        || (memory.commercialState && memory.commercialState !== 'new')
        || (memory.meetingInterest && memory.meetingInterest !== 'unknown')
        || memory.bookingStatus || memory.bookingProvider
      )
    );
    return input.isNewLead && !input.hasPriorConversation && !hasMemory && this.isGenericInformationRequest(input.currentMessage);
  }

  static validate(input: {
    text: string;
    readiness: MeetingReadiness;
    meeting?: MeetingSnapshot | null;
    commercialInformationAuthorized?: boolean;
    asksCommercialDetails?: boolean;
    firstContactDiscovery?: boolean;
  }): SafetyResult {
    const text = input.text.trim();
    const normalized = normalize(text);
    const meeting = input.meeting;
    const confirmed = Boolean(meeting && ['confirmed', 'scheduled'].includes(String(meeting.status)) && (meeting.scheduledAt || meeting.scheduledFor));
    const hasJoinUrl = Boolean(confirmed && meeting?.joinUrl && /^https:\/\//i.test(meeting.joinUrl));
    const violations: string[] = [];

    if (this.detectPlaceholders(text)) violations.push('unresolved_placeholder');
    if (input.firstContactDiscovery && this.containsPrematureFirstContactContent(text)) {
      violations.push('premature_first_contact_commercial_framing');
    }
    if (input.asksCommercialDetails && !input.commercialInformationAuthorized && /\b(ofrecemos|nuestro negocio|nuestro modelo|funciona mediante|incluye|precio|cuesta|ganar|resultado garantizado)\b/.test(normalized)) {
      violations.push('unsupported_commercial_claim');
    }
    const bookingClaim = /\b(reunion|cita)\b.{0,45}\b(confirmad[ao]|reservad[ao]|agendad[ao]|programad[ao])\b|\b(nos vemos|quedo agendada|agende la reunion|reunion esta confirmada)\b/.test(normalized);
    if (bookingClaim && !confirmed) violations.push('false_booking_confirmation');
    const joinClaim = /\b(te envio|te comparto|este es|aqui (?:esta|tienes)|puedes unirte|nos vemos por)\b.{0,55}\b(zoom|meet|enlace|link)\b/.test(normalized);
    if (joinClaim && !hasJoinUrl) violations.push('false_join_url_claim');
    const urls = text.match(/https?:\/\/[^\s)]+/gi) ?? [];
    const authorizedUrls = new Set([meeting?.bookingUrl, meeting?.joinUrl].filter(Boolean));
    if (urls.some(url => !authorizedUrls.has(url))) violations.push('unauthorized_url');
    if (this.containsMeetingCta(text) && input.readiness.reason !== 'qualified_discovery' && input.readiness.reason !== 'explicit_acceptance') {
      violations.push('premature_meeting_cta');
    }
    if (!violations.length) return { text, allowed: true, violations, fallbackUsed: false };
    return { text: this.safeFallback(input.readiness, meeting, input.firstContactDiscovery), allowed: false, violations, fallbackUsed: true };
  }

  static async validateForConversation(input: {
    userId: string;
    conversationId: string;
    text: string;
    readiness: MeetingReadiness;
    commercialInformationAuthorized?: boolean;
    asksCommercialDetails?: boolean;
    firstContactDiscovery?: boolean;
  }): Promise<SafetyResult> {
    const meeting: any = await Meeting.findOne({ userId: input.userId, conversationId: input.conversationId })
      .sort({ createdAt: -1 }).select('status provider joinUrl bookingUrl scheduledAt scheduledFor').lean();
    return this.validate({ ...input, meeting });
  }

  private static containsMeetingCta(text: string): boolean {
    const value = normalize(text);
    return /\b(te gustaria|quieres|deseas|podemos)\b.{0,80}\b(agendar|programar|reservar|coordinar)\b.{0,50}\b(reunion|llamada|cita|asesoria)\b/i.test(value);
  }

  private static containsPrematureFirstContactContent(text: string): boolean {
    const value = normalize(text);
    return /\b(?:negocio|productos?|marca|amway|nutrilite|compr(?:a|ar|as)|inscripcion|registr(?:o|arte|arse)|precios?|reunion|cita|calendly|zoom|ingresos?|ganancias?)\b|https?:\/\//i.test(value);
  }

  private static safeFallback(readiness: MeetingReadiness, meeting?: MeetingSnapshot | null, firstContactDiscovery = false): string {
    if (firstContactDiscovery) {
      return '¡Hola! Gracias por escribir. Para orientarte mejor, ¿qué te llamó la atención o qué te gustaría encontrar en este momento?';
    }
    if (meeting?.status === 'pending_booking' && meeting.bookingUrl) {
      return `Tu preferencia de fecha y hora quedó registrada, pero la reunión aún no está reservada. Confirma un horario disponible aquí: ${meeting.bookingUrl}`;
    }
    if (meeting && ['confirmed', 'scheduled'].includes(String(meeting.status))) {
      if (meeting.joinUrl) return `Tu reunión está confirmada. Puedes consultar el enlace de acceso aquí: ${meeting.joinUrl}`;
      return 'Tu reunión está confirmada, pero el enlace de acceso todavía no está disponible. Te lo compartiremos cuando el sistema lo registre.';
    }
    if (readiness.reason === 'qualified_discovery') {
      return 'Con lo que me cuentas, ya podemos revisar el siguiente paso. ¿Te gustaría recibir la agenda para elegir un horario disponible?';
    }
    return 'No tengo información autorizada suficiente para afirmarlo. Para orientarte bien, ¿qué resultado concreto te gustaría conseguir?';
  }
}
