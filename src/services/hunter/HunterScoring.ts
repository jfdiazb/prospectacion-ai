export type HunterEvidenceCategory = 'commercial' | 'jobAvailability' | 'nutritionWellness' | 'productSales';
export type HunterEvidenceType = 'explicit' | 'indirect' | 'insufficient';
export type HunterEntityType = 'person' | 'organization' | 'unknown';

export interface HunterSource {
  text: string;
  field: 'channel_title' | 'channel_description' | 'video_title' | 'video_description' | 'video_tags';
  url: string;
  publishedAt?: string;
}

export interface HunterEvidence {
  category: HunterEvidenceCategory;
  type: HunterEvidenceType;
  signal: string;
  sourceField: HunterSource['field'];
  publicUrl: string;
  publishedAt?: string;
  observedAt: string;
  confidence: number;
  context: string;
  possibleNegation: boolean;
}

export interface HunterScores {
  commercial: number;
  jobAvailability: number;
  nutritionWellness: number;
  productSales: number;
  overall: number;
}

export const SALES_JOB_SEEKER_NUTRITION_V1 = {
  id: 'sales_job_seeker_nutrition_v1',
  label: 'Vendedor · nuevas oportunidades · nutrición y bienestar',
  weights: { commercial: 0.35, jobAvailability: 0.30, nutritionWellness: 0.20, productSales: 0.15 },
  minimumsForQualified: { commercial: 60, jobAvailability: 60, nutritionWellness: 50 },
  searchGroups: [
    '"busco empleo" vendedor nutrición',
    '"nuevas oportunidades" ventas bienestar',
    '"open to work" sales wellness Colombia',
    'asesor comercial productos salud',
  ],
} as const;

const rules: Record<HunterEvidenceCategory, Array<{ pattern: RegExp; label: string; explicit: boolean; weight: number }>> = {
  commercial: [
    { pattern: /\b(vendedor(?:a)?|asesor(?:a)? comercial|ejecutiv[oa] comercial|representante de ventas|ejecutiv[oa] de cuenta|closer|ventas? b2[bc]|televentas)\b/i, label: 'perfil o cargo comercial', explicit: true, weight: 38 },
    { pattern: /\b(prospecci[oó]n|negociaci[oó]n|cierre de ventas?|atenci[oó]n al cliente|clientes?)\b/i, label: 'experiencia comercial', explicit: false, weight: 18 },
    { pattern: /\b(sales representative|account executive|sales advisor|business development)\b/i, label: 'perfil comercial en inglés', explicit: true, weight: 38 },
  ],
  jobAvailability: [
    { pattern: /\b(busco empleo|buscando empleo|buscando trabajo|disponible para trabajar|buscando nuevas oportunidades|abiert[oa] a nuevas oportunidades)\b/i, label: 'búsqueda laboral explícita', explicit: true, weight: 70 },
    { pattern: /\b(open to work|looking for (?:work|a job)|seeking new opportunities)\b/i, label: 'búsqueda laboral explícita en inglés', explicit: true, weight: 70 },
    { pattern: /\b(nuevos retos|oportunidades profesionales|cambio profesional|próximo reto)\b/i, label: 'disponibilidad laboral indirecta', explicit: false, weight: 42 },
  ],
  nutritionWellness: [
    { pattern: /\b(nutrici[oó]n|nutricionista|alimentaci[oó]n saludable|productos? nutricionales?)\b/i, label: 'nutrición', explicit: true, weight: 32 },
    { pattern: /\b(bienestar|vida saludable|salud y bienestar|h[aá]bitos saludables|suplementaci[oó]n|vitaminas?|prote[ií]na|fitness)\b/i, label: 'bienestar y hábitos saludables', explicit: false, weight: 20 },
    { pattern: /\b(wellness|healthy lifestyle|nutrition|supplements?)\b/i, label: 'bienestar en inglés', explicit: false, weight: 20 },
  ],
  productSales: [
    { pattern: /\b(venta de productos?|asesor[ií]a de productos?|representaci[oó]n comercial|ventas? retail|ventas? directas?)\b/i, label: 'venta de productos', explicit: true, weight: 42 },
    { pattern: /\b(productos? de (?:salud|bienestar)|suplementos?|productos? fitness|recomendaci[oó]n de productos?)\b/i, label: 'productos de bienestar', explicit: false, weight: 24 },
    { pattern: /\b(product sales|retail sales|direct sales|product advisor)\b/i, label: 'venta de productos en inglés', explicit: true, weight: 42 },
  ],
};

const negation = /\b(no|nunca|ni|not|never)\b.{0,35}\b(busco|buscando|disponible|abiert[oa]|open|looking|seeking)\b/i;
const organization = /\b(empresa|academia|instituto|universidad|fundaci[oó]n|tienda|agencia|corporaci[oó]n|company|academy|official)\b/i;
const person = /\b(soy|mi experiencia|trabajo como|me llamo|profesional|asesor(?:a)?|vendedor(?:a)?|consultor(?:a)?|i am|my experience)\b/i;

const contextFor = (text: string, index: number) => text.slice(Math.max(0, index - 55), Math.min(text.length, index + 135)).replace(/\s+/g, ' ').trim();

export function classifyHunterCandidate(sources: HunterSource[], now = new Date()): { entityType: HunterEntityType; entityConfidence: number; evidence: HunterEvidence[]; scores: HunterScores; jobEvidenceType: HunterEvidenceType } {
  const evidence: HunterEvidence[] = [];
  const categoryTotals: Record<HunterEvidenceCategory, number> = { commercial: 0, jobAvailability: 0, nutritionWellness: 0, productSales: 0 };
  const categorySources: Record<HunterEvidenceCategory, Set<string>> = { commercial: new Set(), jobAvailability: new Set(), nutritionWellness: new Set(), productSales: new Set() };

  for (const source of sources) {
    for (const [category, categoryRules] of Object.entries(rules) as Array<[HunterEvidenceCategory, typeof rules[HunterEvidenceCategory]]>) {
      for (const rule of categoryRules) {
        const match = rule.pattern.exec(source.text);
        if (!match) continue;
        const isNegated = category === 'jobAvailability' && negation.test(source.text);
        evidence.push({ category, type: isNegated ? 'insufficient' : rule.explicit ? 'explicit' : 'indirect', signal: match[0], sourceField: source.field, publicUrl: source.url, publishedAt: source.publishedAt, observedAt: now.toISOString(), confidence: isNegated ? 0.92 : rule.explicit ? 0.9 : 0.7, context: contextFor(source.text, match.index), possibleNegation: isNegated });
        if (!isNegated) {
          const identityBoost = source.field === 'channel_description' || source.field === 'channel_title' ? 1.25 : 1;
          categoryTotals[category] += rule.weight * identityBoost;
          categorySources[category].add(source.url);
        }
      }
    }
  }

  const scoreFor = (category: HunterEvidenceCategory) => Math.min(100, Math.round(categoryTotals[category] + Math.max(0, categorySources[category].size - 1) * 12));
  const commercial = scoreFor('commercial');
  const jobAvailability = scoreFor('jobAvailability');
  const nutritionWellness = scoreFor('nutritionWellness');
  const productSales = scoreFor('productSales');
  let overall = Math.round(commercial * .35 + jobAvailability * .30 + nutritionWellness * .20 + productSales * .15);
  if (commercial < 60 || jobAvailability < 60 || nutritionWellness < 50) overall = Math.min(overall, 74);
  const joined = sources.map(source => source.text).join(' ');
  const organizationHits = (joined.match(new RegExp(organization.source, 'gi')) || []).length;
  const personHits = (joined.match(new RegExp(person.source, 'gi')) || []).length;
  const entityType: HunterEntityType = organizationHits > personHits && organizationHits > 0 ? 'organization' : personHits > organizationHits && personHits > 0 ? 'person' : 'unknown';
  const entityConfidence = entityType === 'unknown' ? 0.35 : Math.min(.95, .58 + Math.abs(organizationHits - personHits) * .12);
  const positiveJob = evidence.filter(item => item.category === 'jobAvailability' && !item.possibleNegation);
  const jobEvidenceType: HunterEvidenceType = positiveJob.some(item => item.type === 'explicit') ? 'explicit' : positiveJob.length ? 'indirect' : 'insufficient';
  return { entityType, entityConfidence, evidence, scores: { commercial, jobAvailability, nutritionWellness, productSales, overall }, jobEvidenceType };
}

export function hunterStatus(score: number): 'high_priority' | 'good_candidate' | 'review' | 'low_match' {
  return score >= 85 ? 'high_priority' : score >= 75 ? 'good_candidate' : score >= 60 ? 'review' : 'low_match';
}
