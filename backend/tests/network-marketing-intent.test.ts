import { AMWAY_INITIAL_CONTEXT } from '../src/commercial/presets/amway';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';

describe('network marketing commercial intent', () => {
  test.each([
    'Me interesa el network marketing.',
    'Quiero conocer el mercadeo en red.',
    'Busco una oportunidad multinivel.',
    'Me interesa MLM.',
    'Quiero construir una red.',
    'Quiero construir un equipo.',
  ])('routes %s through the existing business opportunity flow', text => {
    const result = analyzeWhatsAppConversation([text], AMWAY_INITIAL_CONTEXT);

    expect(result.normalizedIntent).toBe('business_opportunity');
    expect(result.tags).toContain('interes_oportunidad_negocio');
    expect(result.score).toBeGreaterThan(20);
    expect(result.signals.entrepreneurshipOpenness).toBeGreaterThanOrEqual(80);
    expect(result.signals.meetingIntent).not.toBe('high');
  });

  test('keeps additional income on its existing automation intent', () => {
    expect(
      analyzeWhatsAppConversation(['Busco ingresos adicionales.'], AMWAY_INITIAL_CONTEXT)
        .normalizedIntent
    ).toBe('additional_income_interest');
  });
});
