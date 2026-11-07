import { CommercialConversationPolicy } from '../src/services/CommercialConversationPolicy';

describe('CommercialConversationPolicy', () => {
  const authorized = {
    brandName: 'Amway',
    businessType: 'venta directa y oportunidad de negocio independiente',
    commercialLines: ['oportunidad de negocio', 'consumo de productos'],
    productFamilies: ['Nutrilite'],
    allowedInformation: ['Nombre de la marca activa', 'Familia Nutrilite como parte de la configuración activa'],
  };

  test.each(['INFO', 'Quiero información', 'Explícame de qué se trata el proyecto', '¿Cómo funciona la oportunidad?'])(
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
});
