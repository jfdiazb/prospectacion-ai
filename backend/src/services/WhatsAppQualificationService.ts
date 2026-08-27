import { IntentNormalizationService, type CommercialContextLike } from './IntentNormalizationService';
import { QualificationPolicyService } from './QualificationPolicyService';

export type ConversationalSignals = {
  need: number; commercialExperience: number; nutritionAffinity: number; entrepreneurshipOpenness: number; interest: number;
  employmentSituation?: string; productSalesAffinity?: string; businessExperience?: string; meetingIntent: 'none' | 'medium' | 'high'; rejectionReason?: string;
};

const norm = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function analyzeWhatsAppConversation(texts: string[], context?: CommercialContextLike | null): { signals: ConversationalSignals; score: number; status: string; intent: string; normalizedIntent: string; tags: string[]; matchedPhrases: string[] } {
  const text = norm(texts.join(' '));
  const normalized = IntentNormalizationService.analyze(texts, context);
  const onlySalary = /solo (?:estoy )?busco|solo quiero/.test(text) && /empleo|trabajo/.test(text) && /salario|contrato/.test(text);
  const rejected = normalized.rejection || /no me interesa|no gracias|no quiero (?:amway|un negocio|continuar)|deja de escribir|\bstop\b/.test(text) || onlySalary;
  const meeting = /quiero (?:una )?reunion|podemos hablar|agendemos|quiero agendar|una llamada/.test(text);
  const interested = /me interesa|quiero conocer|explicame|quiero informacion|\binfo\b|como funciona/.test(text);
  const employment = /busco empleo|buscando trabajo|nueva oportunidad|open to work/.test(text);
  const noCommercialExperience = /nunca he vendido|no (?:tengo|cuento con) experiencia (?:en ventas|comercial)|sin experiencia (?:en ventas|comercial)|seria (?:algo )?nuevo para mi/.test(text);
  const commercial = !noCommercialExperience && /vendedor|asesor comercial|ventas|clientes|prospeccion|negociacion|cierre|he vendido|vendido productos|venta directa|redes sociales|comercializ/.test(text);
  const noBusinessExperience = /nunca he emprendido|no (?:tengo|cuento con) experiencia (?:en negocios|emprendiendo)|seria mi primer (?:negocio|emprendimiento)/.test(text);
  const businessExperience = !noBusinessExperience && /he emprendido|tuve un negocio|tengo un negocio|network marketing|mercadeo en red|liderazgo|manejo de equipo|capta(?:cion|r) de clientes|emprendimiento previo/.test(text);
  const nutrition = /nutricion|bienestar|fitness|vida saludable|suplement|vitamina|proteina/.test(text) || normalized.tags.includes('interes_nutricion');
  const products = normalized.intent === 'product_sales_interest' || normalized.intent === 'business_and_product_interest';
  const entrepreneurship = ['additional_income_interest', 'business_opportunity', 'business_and_product_interest'].includes(normalized.intent);
  const signals: ConversationalSignals = {
    need: employment ? 85 : entrepreneurship ? 80 : interested ? 65 : 25,
    commercialExperience: commercial ? 85 : 15,
    nutritionAffinity: nutrition ? 85 : 15,
    entrepreneurshipOpenness: rejected || onlySalary ? 0 : entrepreneurship ? 90 : interested ? 55 : 20,
    interest: rejected ? 0 : meeting ? 100 : interested ? 80 : entrepreneurship || normalized.intent !== 'undetermined' ? 70 : 25,
    employmentSituation: employment ? 'buscando_oportunidad' : undefined,
    productSalesAffinity: noCommercialExperience ? 'sin_experiencia_declarada' : products ? 'confirmada_por_prospecto' : undefined,
    businessExperience: noBusinessExperience ? 'sin_experiencia_declarada' : businessExperience ? 'experiencia_declarada' : undefined,
    meetingIntent: rejected ? 'none' : meeting ? 'high' : interested || entrepreneurship ? 'medium' : 'none',
    rejectionReason: onlySalary ? 'solo_empleo_tradicional' : rejected ? 'no_interesado' : undefined,
  };
  let score = rejected ? 0 : Math.round(signals.need * .20 + signals.commercialExperience * .20 + signals.nutritionAffinity * .15 + signals.entrepreneurshipOpenness * .25 + signals.interest * .20);
  if (normalized.intent === 'product_interest') score = Math.max(score, 55);
  if (normalized.intent === 'product_sales_interest') score = Math.max(score, 60);
  if (normalized.intent === 'business_and_product_interest') score = Math.max(score, 70);
  const intent = rejected ? 'rejection' : meeting ? 'meeting' : interested ? 'interest' : 'discovery';
  const status = QualificationPolicyService.status(score, intent, signals.meetingIntent);
  return { signals, score, status, intent, normalizedIntent: rejected ? 'rejection' : meeting ? 'meeting' : normalized.intent, tags: normalized.tags, matchedPhrases: normalized.matchedPhrases };
}
