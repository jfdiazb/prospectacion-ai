import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import CommercialContext from '../src/models/CommercialContext';
import { CommercialContextService } from '../src/services/CommercialContextService';
import { analyzeWhatsAppConversation } from '../src/services/WhatsAppQualificationService';
import { MockAIProvider } from '../src/integrations/ai/MockAIProvider';
import { AutomationEngineService } from '../src/services/AutomationEngineService';

describe('Configurable commercial context and normalized intentions', () => {
  let mongo: MongoMemoryServer; let ownerA: string; let ownerB: string;
  beforeAll(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); });
  beforeEach(() => { ownerA = new mongoose.Types.ObjectId().toString(); ownerB = new mongoose.Types.ObjectId().toString(); });
  afterEach(async () => CommercialContext.deleteMany({}));
  afterAll(async () => { await mongoose.disconnect(); await mongo.stop(); });

  test('creates one active initial context per owner and isolates it', async () => {
    const first: any = await CommercialContextService.getActive(ownerA); const same: any = await CommercialContextService.getActive(ownerA); const other: any = await CommercialContextService.getActive(ownerB);
    expect(first.brandName).toBe('Amway'); expect(first._id.toString()).toBe(same._id.toString()); expect(other.userId.toString()).toBe(ownerB); expect(other._id.toString()).not.toBe(first._id.toString());
  });

  test('changes brand/configuration without changing the normalizer', async () => {
    await CommercialContextService.getActive(ownerA);
    const changed: any = await CommercialContextService.replaceActive(ownerA, { brandName: 'Marca Demo', version: 2, commercialLines: ['servicios'], intentTerms: [{ intent: 'product_interest', phrases: ['plan profesional'], tags: ['interes_servicio'] }] });
    const result = analyzeWhatsAppConversation(['Quiero conocer el plan profesional'], changed);
    expect(changed).toMatchObject({ brandName: 'Marca Demo', status: 'active' }); expect(result.normalizedIntent).toBe('product_interest'); expect(result.tags).toContain('interes_servicio');
  });

  test.each(['ingreso adicional', 'ingresos adicionales', 'ingreso extra', 'ingresos extra', 'generar ingresos', 'segunda fuente de ingresos'])('normalizes additional income variant: %s', async phrase => {
    const context: any = await CommercialContextService.getActive(ownerA); const result = analyzeWhatsAppConversation([`Estoy buscando ${phrase}`], context);
    expect(result.normalizedIntent).toBe('additional_income_interest'); expect(result.score).toBeGreaterThan(20); expect(result.tags).toContain('interes_ingresos_adicionales'); expect(result.signals.meetingIntent).not.toBe('high');
  });

  test.each([['una oportunidad de negocio', 'business_opportunity'], ['comprar productos', 'product_interest'], ['Nutrilite para mi consumo', 'product_interest'], ['vender productos', 'product_sales_interest']] as const)('separates commercial intent for %s', async (message, expected) => {
    const context: any = await CommercialContextService.getActive(ownerA); expect(analyzeWhatsAppConversation([message], context).normalizedIntent).toBe(expected);
  });

  test('uses history, keeps semantic tags idempotent and requires explicit meeting language', async () => {
    const context: any = await CommercialContextService.getActive(ownerA);
    const first = analyzeWhatsAppConversation(['Estoy buscando una forma de generar ingresos adicionales.'], context);
    const second = analyzeWhatsAppConversation(['Estoy buscando una forma de generar ingresos adicionales.', 'Sí, me gustaría conocer cómo funciona.'], context);
    expect(second.score).toBeGreaterThan(first.score); expect(second.tags).toEqual([...new Set(second.tags)]); expect(second.signals.meetingIntent).toBe('medium');
    expect(analyzeWhatsAppConversation([...['generar ingresos', 'quiero tener una llamada']], context).signals.meetingIntent).toBe('high');
  });

  test('supports normalized intent as a safe automation condition', () => {
    const event: any = { eventId: 'x', trigger: 'message.received', userId: ownerA, data: { normalizedIntent: 'additional_income_interest' } };
    expect(AutomationEngineService.conditionMatches({ field: 'normalizedIntent', operator: 'eq', value: 'additional_income_interest' }, event)).toBe(true);
    expect(AutomationEngineService.conditionMatches({ field: 'arbitraryCode', operator: 'eq', value: true }, event)).toBe(false);
  });

  test('mock responds to the real message without claiming INFO', async () => {
    const result = await new MockAIProvider().generateReply({ incomingText: 'Estoy buscando una forma de generar ingresos adicionales.', isNewLead: true, intent: 'discovery', normalizedIntent: 'additional_income_interest', platform: 'whatsapp', history: [] });
    expect(result.text).toContain('ingresos adicionales'); expect(result.text).not.toContain('escribir INFO');
  });
});
