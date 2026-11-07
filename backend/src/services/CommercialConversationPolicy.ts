export type AuthorizedCommercialKnowledge = {
  brandName?: string;
  businessType?: string;
  commercialLines?: string[];
  categories?: string[];
  productFamilies?: string[];
  allowedInformation?: string[];
};

const normalize = (value: string): string => value
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es');

export class CommercialConversationPolicy {
  static isGenericInfo(text: string): boolean {
    const value = normalize(text).replace(/[^a-z0-9]+/g, ' ').trim();
    return /^(?:info|informacion|quiero informacion|me interesa)$/.test(value);
  }

  static requiresGrounding(text: string, normalizedIntent?: string): boolean {
    return this.isGenericInfo(text)
      || /empresa|marca|producto|precio|plan|modelo|proyecto|oferta|oportunidad|amway|nutrilite|de que se trata|como funciona|ingresos?|ganar|reunion|cita/i.test(normalize(text))
      || ['additional_income_interest', 'business_opportunity', 'business_and_product_interest', 'product_interest', 'product_sales_interest'].includes(normalizedIntent ?? '');
  }

  static requiresAuthorizedBrief(text: string): boolean {
    const value = normalize(text).replace(/[^a-z0-9]+/g, ' ').trim();
    return this.isGenericInfo(text)
      || /\b(?:explica(?:me)?|cuentame|informacion)\b.{0,45}\b(?:proyecto|oferta|oportunidad|negocio|modelo)\b|\b(?:de que se trata|como funciona)\b/.test(value);
  }

  static authorizedBrief(knowledge?: AuthorizedCommercialKnowledge | null): string | null {
    const brand = String(knowledge?.brandName ?? '').trim();
    const businessType = String(knowledge?.businessType ?? '').trim();
    if (!brand || !businessType) return null;
    const lines = (knowledge?.commercialLines ?? []).map(String).map(value => value.trim()).filter(Boolean).slice(0, 3);
    const families = (knowledge?.productFamilies ?? []).map(String).map(value => value.trim()).filter(Boolean);
    const authorized = normalize((knowledge?.allowedInformation ?? []).join(' '));
    const family = families.find(value => authorized.includes(normalize(value)));
    const scope = lines.length ? ` Incluye ${lines.join(', ')}` : '';
    const familyText = family ? `, con ${family} dentro de la configuración autorizada` : '';
    return `¡Gracias por tu interés! Se trata de ${brand}, un modelo de ${businessType}.${scope}${familyText}. ¿Qué te gustaría conocer o qué buscas lograr?`;
  }

  static containsOutsideOffer(text: string): boolean {
    return /\bfreelanc(?:e|ing)?\b|\binversion(?:es)?\b|\btrading\b|\bcriptomonedas?\b|\bdropshipping\b|\bventas? online\b/i.test(normalize(text));
  }
}
