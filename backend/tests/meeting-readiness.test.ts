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
    expect(readiness(texts)).toMatchObject({ ready: true, reason: 'qualified_discovery', evidence: expect.arrayContaining(['declared_interest', 'declared_need_or_goal', 'prospect_context', 'next_step_openness', 'discovery_conversation']) });
  });

  test('case E keeps the explicit meeting fast path', () => {
    expect(readiness(['Quiero agendar una llamada para conocer el negocio']))
      .toEqual({ ready: true, reason: 'explicit_request', evidence: ['explicit_meeting_intent'] });
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
});
