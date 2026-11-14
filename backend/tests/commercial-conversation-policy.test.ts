import { CommercialConversationPolicy } from '../src/services/CommercialConversationPolicy';

describe('CommercialConversationPolicy', () => {
  const authorized = {
    brandName: 'Amway',
    businessType: 'venta directa y oportunidad de negocio independiente',
    commercialLines: ['oportunidad de negocio', 'consumo de productos'],
    productFamilies: ['Nutrilite'],
    allowedInformation: ['Nombre de la marca activa', 'Familia Nutrilite como parte de la configuración activa'],
  };

  test.each(['INFO', 'Hola quiero info', 'Quiero información', 'Explícame de qué se trata el proyecto', '¿Cómo funciona la oportunidad?', '¿Cuál es la inversión?'])(
    'grounds %s in the authorized commercial context',
    text => expect(CommercialConversationPolicy.requiresAuthorizedBrief(text)).toBe(true),
  );

  test('builds a closed-offer brief without unsupported claims', () => {
    const response = CommercialConversationPolicy.authorizedBrief(authorized)!;
    expect(response).toContain('Amway');
    expect(response).toContain('Nutrilite');
    expect(CommercialConversationPolicy.containsOutsideOffer(response)).toBe(false);
    expect(response).not.toMatch(/\b(?:precio|cuesta|garantiz|reunión|cita|agendad|\$|\d+[.,]?\d*\s*%)\b/i);
  });

  test('does not generate a brief without the minimum authorized facts', () => {
    expect(CommercialConversationPolicy.authorizedBrief({ brandName: 'Amway' })).toBeNull();
  });

  test('answers the confirmed YouTube INFO incident with useful authorized facts', () => {
    const response = CommercialConversationPolicy.responseFor('Hola quiero info', authorized)!;
    expect(response).toMatch(/Amway.*venta directa/i);
    expect(response).not.toMatch(/si necesitas aclarar|con gusto te ayudo|\[[^\]]+\]/i);
  });

  test('does not invent an investment when the active context has no authorized amount', () => {
    const response = CommercialConversationPolicy.responseFor('¿Cuál es la inversión?', {
      ...authorized,
      informationPendingConfirmation: ['precios', 'requisitos'],
    })!;
    expect(response).toMatch(/no tengo una cifra de inversión autorizada/i);
    expect(response).not.toMatch(/\$|usd|cop|\d+[.,]?\d*/i);
    expect(response).not.toMatch(/agendar|reunión|llamada/i);
  });

  test('uses a specifically authorized investment fact', () => {
    const response = CommercialConversationPolicy.responseFor('¿Cuánto cuesta?', {
      ...authorized,
      allowedInformation: [...authorized.allowedInformation, 'La inversión autorizada para este plan es COP 100.'],
    })!;
    expect(response).toContain('COP 100');
  });

  test.each(['Gracias. Si necesitas aclarar algo más sobre el proyecto, con gusto te ayudo.', '¿Quieres que te explique?'])(
    'detects an empty commercial evasion: %s',
    response => expect(CommercialConversationPolicy.isEmptyCommercialEvasion('Hola quiero info', response)).toBe(true),
  );
});
