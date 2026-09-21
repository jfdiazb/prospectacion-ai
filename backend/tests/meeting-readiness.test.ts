import { MeetingReadinessService } from '../src/services/MeetingReadinessService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
import { MockAIProvider } from '../src/integrations/ai/MockAIProvider';

const readiness = (texts: string[]) => MeetingReadinessService.evaluate(texts, analyzeWhatsAppConversation(texts));

describe('ALMA qualification to meeting readiness', () => {
  test.each([
    ['A', ['Quiero más información']],
    ['B', ['Hola, me gustaría más información', 'Quiero aprender sobre ventas de nutrición']],
    ['C', ['Quiero aprender a usar redes sociales para generar nuevas oportunidades']],
  ])('case %s stays in discovery without Calendly', (_case, texts) => {
    expect(readiness(texts as string[])).toMatchObject({ ready: false, reason: 'needs_discovery' });
  });

  test('case D allows a meeting after distinct discovery evidence and next-step openness', () => {
    const texts = [
      'Me interesa conocer la oportunidad de negocio y quiero aprender a conseguir clientes',
      'Actualmente tengo un negocio y mi principal problema es el seguimiento',
      'Sí, estoy dispuesto a conocer una solución y el siguiente paso',
    ];
    const result = readiness(texts);
    expect(result).toMatchObject({ ready: true, reason: 'qualified_discovery', evidence: expect.arrayContaining(['declared_interest', 'declared_need_or_goal', 'prospect_context', 'next_step_openness', 'discovery_conversation']) });
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
  });


  test('case D2 allows a meeting after sustained multi-turn discovery without requiring the prospect to ask for the next step', () => {
    const texts = [
      'Me interesa conocer la oportunidad de negocio',
      'Quiero generar ingresos adicionales y aprender a conseguir clientes',
      'Actualmente estoy empezando desde cero y no tengo experiencia',
    ];
    expect(readiness(texts)).toMatchObject({ ready: true, reason: 'qualified_discovery', evidence: expect.arrayContaining(['declared_interest', 'declared_need_or_goal', 'prospect_context', 'discovery_conversation', 'sustained_engagement']) });
  });

  test('keeps durable discovery evidence when early turns leave the recent-message window', () => {
    const priorEvidence = ['declared_interest', 'declared_need_or_goal', 'prospect_context', 'discovery_conversation'];
    const recentTexts = ['Sí, quiero aprender y conocer el siguiente paso'];
    const result = MeetingReadinessService.evaluate(
      recentTexts,
      analyzeWhatsAppConversation(recentTexts),
      undefined,
      [{ sender: 'lead', text: recentTexts[0] }],
      priorEvidence,
    );

    expect(result).toMatchObject({
      ready: true,
      reason: 'qualified_discovery',
      evidence: expect.arrayContaining([...priorEvidence, 'next_step_openness']),
    });
  });

  test('case E keeps the explicit meeting fast path', () => {
    expect(readiness(['Quiero agendar una llamada para conocer el negocio']))
      .toEqual({ ready: true, reason: 'explicit_request', evidence: ['explicit_meeting_intent'] });
  });

  test('a yes to a free-time discovery question does not become meeting intent', () => {
    const texts = ['Busco generar ingresos adicionales', 'Sí'];
    const conversation = [
      { sender: 'lead' as const, text: texts[0] },
      { sender: 'ai' as const, text: '¿Buscas una opción que puedas desarrollar en tus tiempos libres?' },
      { sender: 'lead' as const, text: texts[1] },
    ];
    expect(MeetingReadinessService.evaluate(texts, analyzeWhatsAppConversation(texts), undefined, conversation))
      .toMatchObject({ ready: false, reason: 'needs_discovery' });
  });

  test('a yes to an explicit meeting offer is recognized from conversational history', () => {
    const texts = ['Quiero conocer cómo funciona el negocio', 'Sí, por favor'];
    const conversation = [
      { sender: 'lead' as const, text: texts[0] },
      { sender: 'ai' as const, text: '¿Te gustaría que programemos una reunión para explicarte el siguiente paso?' },
      { sender: 'lead' as const, text: texts[1] },
    ];
    const result = MeetingReadinessService.evaluate(texts, analyzeWhatsAppConversation(texts), undefined, conversation);
    expect(result).toEqual({ ready: true, reason: 'explicit_acceptance', evidence: ['explicit_meeting_acceptance'] });
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(true);
  });

  test('case F does not carry stale meeting intent into a later discovery turn', () => {
    const texts = ['Quiero agendar una llamada', 'Antes quiero aprender sobre ventas de nutrición'];
    const qualification = analyzeWhatsAppConversation(texts);
    expect(qualification.signals.meetingIntent).not.toBe('high');
    expect(MeetingReadinessService.evaluate(texts, qualification).reason).toBe('needs_discovery');
  });

  test('case F asks for a new piece of context instead of repeating the starting question', async () => {
    const provider = new MockAIProvider();
    const first = await provider.generateReply({ incomingText: 'Quiero aprender ventas de nutrición', isNewLead: false, intent: 'discovery', normalizedIntent: 'product_sales_interest', platform: 'youtube', history: [] });
    const second = await provider.generateReply({ incomingText: 'Ya vendo productos', isNewLead: false, intent: 'discovery', normalizedIntent: 'product_sales_interest', platform: 'youtube', history: [{ sender: 'ai', text: first.text }, { sender: 'lead', text: 'Ya vendo productos' }] });
    expect(first.text).toMatch(/ya vendes|empezar desde cero/i);
    expect(second.text).toMatch(/dificultad|clientes|seguimiento|cerrar/i);
    expect(second.text).not.toBe(first.text);
  });

  test('case G remains eligible for discovery follow-up instead of a meeting', () => {
    expect(readiness(['Quiero más información'])).toMatchObject({ ready: false, reason: 'needs_discovery' });
  });

  test('the real WhatsApp discovery is enough to offer a meeting without sending Calendly', () => {
    const texts = [
      'Quiero información para generar ingresos adicionales',
      'Podría dedicar 5 horas semanales',
      'Me gustaría generar unos $500.000 adicionales al mes',
      'Me gustaría aprender a vender productos por internet utilizando las redes sociales y la inteligencia artificial',
      'Utilizo Facebook, Instagram y WhatsApp',
      'Tengo poca experiencia vendiendo, pero quiero aprender a generar ingresos adicionales utilizando estas herramientas',
    ];
    const conversation = texts.map(text => ({ sender: 'lead' as const, text }));
    const result = MeetingReadinessService.evaluate(texts, analyzeWhatsAppConversation(texts), undefined, conversation);

    expect(result).toMatchObject({
      ready: true,
      reason: 'qualified_discovery',
      evidence: expect.arrayContaining([
        'declared_interest',
        'declared_need_or_goal',
        'prospect_context',
        'discovery_conversation',
        'guidance_interest',
      ]),
    });
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
    expect(MeetingReadinessService.shouldOfferMeeting(result, conversation)).toBe(true);
    const response = MeetingReadinessService.meetingOfferFor(result, conversation, texts);
    expect(response).toMatch(/programáramos una reunión/i);
    expect(response).toMatch(/redes sociales y la inteligencia artificial/i);
    expect(response).not.toMatch(/calendly|https?:\/\//i);
    expect(response).not.toMatch(/contenido|formatos/i);
  });

  test('a comprehensive first WhatsApp message is sufficient discovery', () => {
    const text = 'Hola, quiero aprender a generar ingresos adicionales usando redes sociales e inteligencia artificial. Mi meta es ganar $500.000 adicionales al mes, puedo dedicar 5 horas semanales y utilizo Facebook, Instagram y WhatsApp';
    const conversation = [{ sender: 'lead' as const, text }];
    const result = MeetingReadinessService.evaluate([text], analyzeWhatsAppConversation([text]), undefined, conversation);

    expect(result).toMatchObject({
      ready: true,
      reason: 'qualified_discovery',
      evidence: expect.arrayContaining(['comprehensive_single_turn', 'discovery_conversation']),
    });
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
    expect(MeetingReadinessService.meetingOfferFor(result, conversation, [text])).toMatch(/programáramos una reunión/i);
  });

  test.each([
    'Quiero generar $500.000 al mes',
    'Quiero aprender a vender usando Instagram',
    'Puedo dedicar 5 horas semanales a conocer la oportunidad',
  ])('does not treat a partial first message as comprehensive discovery: %s', text => {
    expect(readiness([text])).toMatchObject({ ready: false, reason: 'needs_discovery' });
  });

  test('does not repeat a meeting offer after an explicit decline', () => {
    const offer = MeetingReadinessService.meetingOffer();
    const texts = ['Quiero aprender a vender productos y generar ingresos', 'No, prefiero recibir información por aquí'];
    const conversation = [
      { sender: 'lead' as const, text: texts[0] },
      { sender: 'ai' as const, text: offer },
      { sender: 'lead' as const, text: texts[1] },
    ];
    const result = MeetingReadinessService.evaluate(texts, analyzeWhatsAppConversation(texts), undefined, conversation);
    expect(result).toEqual({ ready: false, reason: 'meeting_declined', evidence: ['explicit_meeting_decline'] });
    expect(MeetingReadinessService.shouldOfferMeeting(result, conversation)).toBe(false);
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
  });

  test('a greeting alone starts discovery without offering or scheduling a meeting', () => {
    const result = readiness(['Hola']);
    expect(result).toMatchObject({ ready: false, reason: 'needs_discovery' });
    expect(MeetingReadinessService.shouldOfferMeeting(result)).toBe(false);
    expect(MeetingReadinessService.shouldStartScheduling(result)).toBe(false);
  });
});
