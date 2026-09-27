import { ConversationalSafetyService } from '../src/services/ConversationalSafetyService';
import { MeetingReadinessService, type MeetingReadiness } from '../src/services/MeetingReadinessService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
const corpus = require('./fixtures/behavioral-regression-corpus.json') as {
  version: string;
  cases: Array<{ id: string; source?: string; turns: string[]; forbidden?: string[] }>;
};

const discovery: MeetingReadiness = { ready: false, reason: 'needs_discovery', evidence: [] };
const qualified: MeetingReadiness = { ready: true, reason: 'qualified_discovery', evidence: ['declared_interest', 'declared_need_or_goal', 'prospect_context', 'discovery_conversation', 'sustained_engagement'] };

describe('Behavioral/commercial production certification', () => {
  const placeholderVariants = [
    '[sector/servicio]', '[producto]', '[marca]', '{{variable}}', '{{ price }}', '${variable}',
    '<placeholder>', '<TODO>', '<variable>', 'TODO', 'TBD', 'Texto [servicio/producto]',
  ];
  test.each(placeholderVariants)('blocks unresolved placeholder: %s', value => {
    const result = ConversationalSafetyService.validate({ text: `Nuestro negocio ofrece ${value}.`, readiness: discovery });
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('unresolved_placeholder');
    expect(result.text).not.toContain(value);
  });

  const falseBookingClaims = [
    'Tu reunión está confirmada', 'La reunión quedó agendada', 'Nos vemos el lunes a las 8',
    'Agendé la reunión para mañana', 'La cita está reservada', 'La reunión está programada',
  ];
  test.each(falseBookingClaims)('blocks booking language without persisted booking: %s', text => {
    const result = ConversationalSafetyService.validate({ text, readiness: qualified, meeting: { status: 'pending_booking', provider: 'calendly' } });
    expect(result.violations).toContain('false_booking_confirmation');
    expect(result.allowed).toBe(false);
  });

  const falseJoinClaims = [
    'Te envío el enlace de Zoom', 'Te comparto el link de Meet', 'Este es tu enlace de Zoom',
    'Aquí tienes el enlace', 'Puedes unirte aquí por Zoom', 'Nos vemos por Zoom',
  ];
  test.each(falseJoinClaims)('blocks join URL language without a persisted joinUrl: %s', text => {
    const result = ConversationalSafetyService.validate({ text, readiness: qualified, meeting: { status: 'confirmed', scheduledFor: new Date() } });
    expect(result.violations).toContain('false_join_url_claim');
  });

  test.each([
    '¿Te gustaría programar una reunión?', '¿Quieres agendar una llamada?', 'Podemos coordinar una asesoría',
    '¿Deseas reservar una cita?', '¿Te gustaría agendar una reunión para mañana?',
  ])('blocks premature CTA: %s', text => {
    expect(ConversationalSafetyService.validate({ text, readiness: discovery }).violations).toContain('premature_meeting_cta');
  });

  test.each([
    'https://zoom.us/j/fabricado', 'https://calendly.com/falso/agenda', 'http://example.com/reunion',
    'Mira https://meet.google.com/falso', 'Reserva en https://example.org/book',
  ])('blocks unauthorized URLs: %s', url => {
    expect(ConversationalSafetyService.validate({ text: `Puedes usar ${url}`, readiness: qualified }).violations).toContain('unauthorized_url');
  });

  test.each(corpus.cases)('corpus $id remains free of critical textual claims', scenario => {
    expect(scenario.turns.length).toBeGreaterThan(0);
    for (const forbidden of scenario.forbidden ?? []) {
      const result = ConversationalSafetyService.validate({ text: forbidden, readiness: discovery });
      expect(result.allowed).toBe(false);
    }
  });

  const firstContactInformationVariants = [
    'Info', 'INFO', 'info', 'Información', 'Quiero información', 'Me interesa',
  ];
  test.each(firstContactInformationVariants)('new empty first contact %s stays in natural discovery', message => {
    const qualification = analyzeWhatsAppConversation([message]);
    const readiness = MeetingReadinessService.evaluate([message], qualification, undefined, [{ sender: 'lead', text: message }]);
    const firstContactDiscovery = ConversationalSafetyService.isFirstContactDiscovery({
      isNewLead: true, currentMessage: message, hasPriorConversation: false,
      commercialMemory: { interests: [], needs: [], objections: [], meetingEvidence: [], commercialState: 'new', meetingInterest: 'unknown' },
    });
    const result = ConversationalSafetyService.validate({
      text: '¿Qué información específica te gustaría recibir sobre nuestro modelo de negocio o productos?',
      readiness, firstContactDiscovery,
    });
    expect(firstContactDiscovery).toBe(true);
    expect(readiness.reason).toBe('needs_discovery');
    expect(MeetingReadinessService.shouldStartScheduling(readiness)).toBe(false);
    expect(result.allowed).toBe(false);
    expect(result.violations).toContain('premature_first_contact_commercial_framing');
    expect(result.fallbackUsed).toBe(true);
    expect(result.text).toMatch(/qué te llamó la atención|qué te gustaría encontrar|qué buscas|qué necesitas|cuál es tu situación/i);
    expect(result.text).not.toMatch(/negocio|producto|marca|amway|nutrilite|compr|inscrip|registr|precio|reunión|calendly|zoom|ingres|ganancia/i);
    expect(result.text).not.toMatch(/https?:\/\//i);
    expect(ConversationalSafetyService.detectPlaceholders(result.text)).toBe(false);
  });

  test('allows a natural first-contact discovery opening without forcing commercial choices', () => {
    const result = ConversationalSafetyService.validate({
      text: '¡Hola! Gracias por escribir. ¿Qué te llamó la atención o qué te gustaría encontrar en este momento?',
      readiness: discovery, firstContactDiscovery: true,
    });
    expect(result.allowed).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.violations).toEqual([]);
  });

  test('existing lead with legitimate commercial context is not reclassified as first contact', () => {
    const firstContactDiscovery = ConversationalSafetyService.isFirstContactDiscovery({
      isNewLead: false, currentMessage: 'INFO', hasPriorConversation: true,
      commercialMemory: { interests: ['productos'], needs: ['bienestar'], commercialState: 'discovering' },
    });
    const result = ConversationalSafetyService.validate({
      text: 'Retomando lo que conversamos, puedo ampliar la información sobre los productos que te interesaron.',
      readiness: discovery, firstContactDiscovery, commercialInformationAuthorized: true,
    });
    expect(firstContactDiscovery).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.fallbackUsed).toBe(false);
    expect(result.violations).not.toContain('premature_first_contact_commercial_framing');
  });

  test('Carlos cannot jump from discovery to scheduling or turn a date preference into booking evidence', () => {
    const leadTexts = ['Info', 'De que se trata, como funciona', 'Generar ingresos adicionales usando las redes sociales'];
    const turns = leadTexts.map(text => ({ sender: 'lead' as const, text }));
    const result = MeetingReadinessService.evaluate(leadTexts, analyzeWhatsAppConversation(leadTexts), undefined, turns);
    expect(result.reason).toBe('needs_discovery');
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
    const datePreference = MeetingReadinessService.evaluate([...leadTexts, 'El lunes 28 a las 8 pm'], analyzeWhatsAppConversation([...leadTexts, 'El lunes 28 a las 8 pm']));
    expect(MeetingReadinessService.shouldStartScheduling(datePreference)).toBe(false);
    const guarded = ConversationalSafetyService.validate({ text: '¡Listo! Nos vemos el lunes 28 a las 8 pm. Te envío el enlace de Zoom.', readiness: datePreference, meeting: { status: 'pending_booking' } });
    expect(guarded.allowed).toBe(false);
    expect(guarded.violations).toEqual(expect.arrayContaining(['false_booking_confirmation', 'false_join_url_claim']));
  });

  test('confirmed booking without joinUrl uses safe state-bound language', () => {
    const result = ConversationalSafetyService.validate({ text: 'Te envío el enlace de Zoom', readiness: qualified, meeting: { status: 'confirmed', scheduledFor: new Date() } });
    expect(result.text).toMatch(/confirmada/i);
    expect(result.text).toMatch(/todavía no está disponible/i);
    expect(result.text).not.toMatch(/https?:\/\//i);
  });

  test('confirmed booking with a real joinUrl permits the exact persisted URL', () => {
    const joinUrl = 'https://zoom.us/j/123456';
    const result = ConversationalSafetyService.validate({ text: `Tu reunión está confirmada. Puedes unirte aquí: ${joinUrl}`, readiness: qualified, meeting: { status: 'confirmed', scheduledFor: new Date(), joinUrl } });
    expect(result.allowed).toBe(true);
  });

  test.each(Array.from({ length: 24 }, (_, index) => ({ id: `synthetic-${index + 1}`, message: index % 2 ? 'Quiero reunión mañana a las 8 pm' : '¿Cómo funciona?' })))('$id cannot create operational reality from prospect text', scenario => {
    const result = MeetingReadinessService.evaluate([scenario.message], analyzeWhatsAppConversation([scenario.message]));
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
    expect(ConversationalSafetyService.validate({ text: 'Tu reunión quedó confirmada y te envío el enlace de Zoom', readiness: result }).allowed).toBe(false);
  });
});
