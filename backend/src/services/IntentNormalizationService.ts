export type NormalizedIntent = 'additional_income_interest' | 'business_opportunity' | 'product_interest' | 'product_sales_interest' | 'business_and_product_interest' | 'undetermined' | 'rejection' | 'meeting';
export type CommercialContextLike = { _id?: unknown; brandName?: string; intentTerms?: Array<{ intent: string; phrases: string[]; tags?: string[] }> };

export const normalizeCommercialText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
const containsPhrase = (text: string, phrase: string) => ` ${text} `.includes(` ${normalizeCommercialText(phrase)} `);

export class IntentNormalizationService {
  static analyze(texts: string[], context?: CommercialContextLike | null) {
    const text = normalizeCommercialText(texts.join(' '));
    const currentText = normalizeCommercialText(texts.at(-1) ?? '');
    const explicitMeeting = /\b(quiero|podemos|quisiera|agendemos|programar|tener|necesito|deseo)\b.{0,45}\b(reunion|reunirnos|llamada|agendar|agenda|videollamada|asesoria|horarios?)\b|\bpodemos hablar(?:\s+(?:hoy|manana|esta semana))?\b|\b(agendar|agenda|programar|reservar)\b/.test(currentText);
    const rejection = /\b(no me interesa|no quiero|deja de escribir|no contactar|stop)\b/.test(text);
    const matches = new Map<string, { phrases: string[]; tags: string[] }>();
    const genericTerms = [
      { intent: 'additional_income_interest', phrases: ['ingreso adicional', 'ingresos adicionales', 'ingreso extra', 'ingresos extra', 'generar ingresos', 'segunda fuente de ingresos', 'actividad adicional', 'trabajar desde casa'], tags: ['interes_ingresos_adicionales'] },
      { intent: 'business_opportunity', phrases: ['oportunidad de negocio', 'oportunidad para emprender', 'emprendimiento', 'emprender', 'negocio propio', 'desarrollar un negocio', 'construir un negocio', 'construir algo propio', 'formar un equipo', 'desarrollar el negocio', 'como funciona el modelo', 'modelo de negocio'], tags: ['interes_oportunidad_negocio'] },
      { intent: 'product_interest', phrases: ['conocer productos', 'conocer los productos', 'que productos manejan', 'usar productos', 'usar los productos', 'comprar productos', 'comprar un producto', 'comprar producto', 'consumir productos', 'interes en productos', 'uso personal', 'usarlos'], tags: ['interes_productos'] },
      { intent: 'product_sales_interest', phrases: ['vender productos', 'vender los productos', 'vender algunos productos', 'vendiendo estos productos', 'venderlos', 'venta de productos', 'comercializar productos', 'comercializarlos', 'ofrecer estos productos', 'he vendido productos', 'vender por redes sociales'], tags: ['interes_venta_productos'] },
    ];
    for (const group of [...genericTerms, ...(context?.intentTerms ?? [])]) {
      const phrases = (group.phrases ?? []).filter(phrase => containsPhrase(text, phrase));
      if (phrases.length) { const previous = matches.get(group.intent); matches.set(group.intent, { phrases: [...new Set([...(previous?.phrases ?? []), ...phrases])], tags: [...new Set([...(previous?.tags ?? []), ...(group.tags ?? [])])] }); }
    }
    const explicitBusinessExploration = /\b(?:conocer|saber|entender|explicame|explicar)\s+(?:(?:como funciona|de que se trata)\s+)?(?:el |la )?(?:negocio|modelo de negocio|oportunidad)\b/.test(text);
    if (explicitBusinessExploration) {
      const previous = matches.get('business_opportunity');
      matches.set('business_opportunity', { phrases: [...new Set([...(previous?.phrases ?? []), 'exploracion explicita de negocio'])], tags: [...new Set([...(previous?.tags ?? []), 'interes_oportunidad_negocio'])] });
    }
    const mentionsProductsAndBusiness = /\bproductos?\b.*\b(?:negocio|modelo|oportunidad)\b|\b(?:negocio|modelo|oportunidad)\b.*\bproductos?\b/.test(text);
    if (matches.has('product_interest') && mentionsProductsAndBusiness) {
      const previous = matches.get('business_opportunity');
      matches.set('business_opportunity', { phrases: [...new Set([...(previous?.phrases ?? []), 'interes combinado explicito'])], tags: [...new Set([...(previous?.tags ?? []), 'interes_oportunidad_negocio'])] });
    }
    const hasBusiness = matches.has('business_opportunity') || matches.has('additional_income_interest');
    const hasProduct = matches.has('product_interest');
    const hasSales = matches.has('product_sales_interest');
    const prioritizesProduct = /\b(?:primero|en realidad)\b.*\b(?:conocer|usar|comprar|consumir|productos?)\b/.test(currentText);
    const prioritizesSales = /\b(?:primero|en realidad)\b.*\b(?:vender|venta|comercializar|ofrecer)\b.*\bproductos?\b/.test(currentText);
    const prioritizesBusiness = /\b(?:primero|en realidad)\b.*\b(?:entender|conocer|saber|explicame|explicar|desarrollar)\b.*\b(?:negocio|modelo|oportunidad)\b/.test(currentText);
    const keepsBoth = /\b(?:ambas cosas|las dos cosas|los dos|productos? y (?:el )?(?:negocio|modelo|oportunidad))\b/.test(currentText);
    const intent: NormalizedIntent = rejection ? 'rejection' : explicitMeeting ? 'meeting'
      : prioritizesSales ? 'product_sales_interest'
        : prioritizesProduct && !keepsBoth ? 'product_interest'
          : prioritizesBusiness && !keepsBoth ? 'business_opportunity'
      : hasBusiness && (hasProduct || hasSales) ? 'business_and_product_interest'
        : hasSales ? 'product_sales_interest' : hasProduct ? 'product_interest'
          : matches.has('business_opportunity') ? 'business_opportunity'
            : matches.has('additional_income_interest') ? 'additional_income_interest' : 'undetermined';
    const tags = [...new Set([...matches.values()].flatMap(item => item.tags).map(tag => normalizeCommercialText(tag).replace(/ /g, '_')).filter(Boolean))];
    return { intent, intents: [...matches.keys()], tags, matchedPhrases: [...matches.values()].flatMap(item => item.phrases), explicitMeeting, rejection };
  }
}
