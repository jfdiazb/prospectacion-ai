import CommercialContext from '../models/CommercialContext';
import { AMWAY_INITIAL_CONTEXT } from '../commercial/presets/amway';

const textArray = (value: unknown, max = 50) => Array.isArray(value) ? value.slice(0, max).map(item => String(item).trim().slice(0, 300)).filter(Boolean) : [];

export class CommercialContextService {
  static async getActive(userId: string, initialize = true): Promise<any> {
    const current = await CommercialContext.findOne({ userId, status: 'active' });
    if (current || !initialize) return current;
    try { return await CommercialContext.create({ userId, ...AMWAY_INITIAL_CONTEXT }); }
    catch (error: any) { if (error?.code === 11000) return CommercialContext.findOne({ userId, status: 'active' }); throw error; }
  }

  static sanitize(input: any) {
    const brandName = String(input?.brandName ?? '').trim().slice(0, 120);
    if (brandName.length < 2) throw new Error('La marca debe tener al menos 2 caracteres');
    const intentTerms = Array.isArray(input.intentTerms) ? input.intentTerms.slice(0, 30).map((item: any) => ({
      intent: String(item.intent ?? '').trim().slice(0, 80), phrases: textArray(item.phrases, 100), tags: textArray(item.tags, 30),
    })).filter((item: any) => item.intent && item.phrases.length) : [];
    return { brandName, description: String(input.description ?? '').trim().slice(0, 2000), businessType: String(input.businessType ?? '').trim().slice(0, 120),
      commercialLines: textArray(input.commercialLines), categories: textArray(input.categories), productFamilies: textArray(input.productFamilies),
      targetProfiles: Array.isArray(input.targetProfiles) ? input.targetProfiles.slice(0, 20) : [], intentTerms,
      qualificationCriteria: textArray(input.qualificationCriteria), communicationRules: textArray(input.communicationRules),
      allowedInformation: textArray(input.allowedInformation), informationPendingConfirmation: textArray(input.informationPendingConfirmation),
      restrictions: textArray(input.restrictions), disclaimers: textArray(input.disclaimers), version: Math.max(1, Number(input.version) || 1) };
  }

  static async replaceActive(userId: string, input: any) {
    const clean = this.sanitize(input);
    const previous: any = await CommercialContext.findOneAndUpdate({ userId, status: 'active' }, { $set: { status: 'inactive' } }, { new: false });
    try { return await CommercialContext.create({ userId, ...clean, status: 'active' }); }
    catch (error) { if (previous) await CommercialContext.updateOne({ _id: previous._id, userId }, { $set: { status: 'active' } }); throw error; }
  }
}
