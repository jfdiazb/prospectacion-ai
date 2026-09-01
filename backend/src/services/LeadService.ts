import Lead from '../models/Lead';
import type { ILead, IPaginatedResponse, IPaginationParams } from '../types/index';
import mongoose from 'mongoose';
import Activity from '../models/Activity';
import { calculateLeadScore } from '../utils/helpers';

/**
 * Servicio de GestiÃ³n de Leads
 */
export class LeadService {
  /**
   * Crear nuevo lead
   */
  static async createLead(userId: string, leadData: Partial<ILead>): Promise<ILead> {
    // Calcular score automÃ¡ticamente
    const score = calculateLeadScore({
      followers: leadData.followers,
      engagement: leadData.engagement,
      bio: leadData.bio,
    });

    // Determinar nivel de interÃ©s basado en score
    let interestLevel = 'cold';
    if (score > 70) interestLevel = 'hot';
    else if (score > 30) interestLevel = 'warm';

    const lead = await Lead.create({
      ...leadData,
      userId,
      score,
      interestLevel,
    });

    return lead;
  }

  /**
   * Obtener todos los leads del usuario
   */
  static async getUserLeads(
    userId: string,
    params: IPaginationParams = {}
  ): Promise<IPaginatedResponse<ILead>> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const skip = (page - 1) * limit;

    const [leads, total] = await Promise.all([
      Lead.find({ userId }).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Lead.countDocuments({ userId }),
    ]);

    return {
      data: leads,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  /**
   * Obtener lead por ID
   */
  static async getLeadById(leadId: string, userId: string): Promise<ILead | null> {
    return await Lead.findOne({ _id: leadId, userId });
  }

  /**
   * Actualizar lead
   */
  static async updateLead(leadId: string, userId: string, updateData: Partial<ILead>): Promise<ILead | null> {
    const immutableFields = new Set(['_id', 'userId', 'createdAt', 'updatedAt']);
    const safeUpdate = Object.fromEntries(Object.entries(updateData).filter(([key]) => !immutableFields.has(key))) as Partial<ILead>;
    const scoreInputsChanged = ['followers', 'engagement', 'bio'].some(key => key in safeUpdate);
    const currentLead = scoreInputsChanged
      ? await Lead.findOne({ _id: leadId, userId })
      : null;

    if (scoreInputsChanged && !currentLead) return null;

    const mergedData = {
      followers: safeUpdate.followers ?? currentLead?.followers,
      engagement: safeUpdate.engagement ?? currentLead?.engagement,
      bio: safeUpdate.bio ?? currentLead?.bio,
    };
    const score = scoreInputsChanged ? calculateLeadScore(mergedData) : undefined;
    const interestLevel = score === undefined
      ? undefined
      : score > 70 ? 'hot' : score > 30 ? 'warm' : 'cold';

    return await Lead.findOneAndUpdate(
      { _id: leadId, userId },
      { ...safeUpdate, ...(score === undefined ? {} : { score, interestLevel }) },
      { new: true, runValidators: true }
    );
  }

  /**
   * Eliminar lead
   */
  static async deleteLead(leadId: string, userId: string): Promise<boolean> {
    const result = await Lead.deleteOne({ _id: leadId, userId });
    return result.deletedCount > 0;
  }

  /**
   * Buscar leads por estado
   */
  static async getLeadsByStatus(userId: string, status: string): Promise<ILead[]> {
    return await Lead.find({ userId, status });
  }

  /**
   * Obtener leads calientes
   */
  static async getHotLeads(userId: string): Promise<ILead[]> {
    return await Lead.find({ userId, interestLevel: 'hot' }).sort({ score: -1 }).limit(10);
  }

  /**
   * Actualizar estado del lead
   */
  static async updateLeadStatus(
    leadId: string,
    userId: string,
    status: string
  ): Promise<ILead | null> {
    return await Lead.findOneAndUpdate({ _id: leadId, userId }, { status }, { new: true });
  }

  static async recordCommercialOutcome(userId: string, leadId: string, outcome: 'follow_up' | 'not_interested' | 'client' | 'partner', sourceMeetingId?: string) {
    const recordedAt = new Date();
    const lead = await Lead.findOneAndUpdate(
      { _id: leadId, userId },
      { $set: { commercialOutcome: { type: outcome, recordedAt, recordedBy: 'human', sourceMeetingId: sourceMeetingId || undefined } } },
      { new: true, runValidators: true },
    );
    if (lead) await Activity.create({ userId, leadId, type: 'commercial_outcome_recorded', description: `Resultado comercial registrado: ${outcome}`, metadata: { outcome, sourceMeetingId } });
    return lead;
  }

  /**
   * Buscar leads por plataforma
   */
  static async getLeadsByPlatform(userId: string, platform: string): Promise<ILead[]> {
    return await Lead.find({ userId, platform }).sort({ createdAt: -1 });
  }

  /**
   * Recalcular scores de todos los leads
   */
  static async recalculateScores(userId: string): Promise<void> {
    const leads = await Lead.find({ userId });

    for (const lead of leads) {
      const score = calculateLeadScore({
        followers: lead.followers,
        engagement: lead.engagement,
        bio: lead.bio,
      });

      let interestLevel = 'cold';
      if (score > 70) interestLevel = 'hot';
      else if (score > 30) interestLevel = 'warm';

      await Lead.updateOne({ _id: lead._id }, { score, interestLevel });
    }
  }

  /**
   * Obtener estadÃ­sticas de leads
   */
  static async getLeadStats(userId: string) {
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - 6);
    const [result] = await Lead.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      { $facet: {
        totals: [{ $group: { _id: null, totalLeads: { $sum: 1 }, newLeads: { $sum: { $cond: [{ $eq: ['$status', 'new'] }, 1, 0] } }, hotLeads: { $sum: { $cond: [{ $eq: ['$interestLevel', 'hot'] }, 1, 0] } }, registeredLeads: { $sum: { $cond: [{ $eq: ['$status', 'registered'] }, 1, 0] } }, convertedLeads: { $sum: { $cond: [{ $in: ['$commercialOutcome.type', ['client', 'partner']] }, 1, 0] } } } }],
        weekly: [{ $match: { createdAt: { $gte: since } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'UTC' } }, leads: { $sum: 1 }, hot: { $sum: { $cond: [{ $eq: ['$interestLevel', 'hot'] }, 1, 0] } } } }, { $sort: { _id: 1 } }],
        weeklyConversions: [{ $match: { 'commercialOutcome.recordedAt': { $gte: since }, 'commercialOutcome.type': { $in: ['client', 'partner'] } } }, { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$commercialOutcome.recordedAt', timezone: 'UTC' } }, conversions: { $sum: 1 } } }],
        channels: [{ $group: { _id: { $ifNull: ['$platform', 'unknown'] }, value: { $sum: 1 } } }, { $sort: { value: -1 } }],
      } },
    ]);
    const totals = result?.totals?.[0] || {};
    const totalLeads = totals.totalLeads || 0;
    const newLeads = totals.newLeads || 0;
    const hotLeads = totals.hotLeads || 0;
    const registeredLeads = totals.registeredLeads || 0;
    const convertedLeads = totals.convertedLeads || 0;
    const weeklyByDate = new Map((result?.weekly || []).map((item: any) => [item._id, item]));
    const conversionsByDate = new Map((result?.weeklyConversions || []).map((item: any) => [item._id, item.conversions]));
    const weeklyLeads = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(since); date.setUTCDate(since.getUTCDate() + index);
      const key = date.toISOString().slice(0, 10); const item: any = weeklyByDate.get(key);
      return { name: new Intl.DateTimeFormat('es-CO', { weekday: 'short', timeZone: 'UTC' }).format(date), leads: item?.leads || 0, conversions: conversionsByDate.get(key) || 0, hot: item?.hot || 0 };
    });

    return {
      totalLeads,
      newLeads,
      hotLeads,
      registeredLeads,
      convertedLeads,
      conversionRate: totalLeads > 0 ? (convertedLeads / totalLeads) * 100 : 0,
      weeklyLeads,
      channelPerformance: (result?.channels || []).map((item: any) => ({ name: item._id, value: item.value })),
    };
  }

  /**
   * Buscar leads por tags
   */
  static async getLeadsByTags(userId: string, tags: string[]): Promise<ILead[]> {
    return await Lead.find({ userId, tags: { $in: tags } });
  }

  /**
   * Buscar leads por criterios avanzados
   */
  static async advancedSearch(
    userId: string,
    filters: {
      status?: string;
      platform?: string;
      interestLevel?: string;
      minFollowers?: number;
      maxFollowers?: number;
      minScore?: number;
      maxScore?: number;
      searchTerm?: string;
      sortBy?: 'score_desc' | 'score_asc' | 'recent';
    }
  ): Promise<ILead[]> {
    const query: any = { userId };

    if (filters.status) query.status = filters.status;
    if (filters.platform) query.platform = filters.platform;
    if (filters.interestLevel) query.interestLevel = filters.interestLevel;
    if (filters.minFollowers) query.followers = { $gte: filters.minFollowers };
    if (filters.maxFollowers) query.followers = { ...query.followers, $lte: filters.maxFollowers };
    if (filters.minScore !== undefined) query.score = { $gte: Math.max(0, Number(filters.minScore)) };
    if (filters.maxScore !== undefined) query.score = { ...query.score, $lte: Math.min(100, Number(filters.maxScore)) };
    if (filters.searchTerm) {
      query.$or = [
        { username: { $regex: filters.searchTerm, $options: 'i' } },
        { fullName: { $regex: filters.searchTerm, $options: 'i' } },
        { bio: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    const sort: Record<string, 1 | -1> = filters.sortBy === 'score_asc' ? { score: 1 }
      : filters.sortBy === 'recent' ? { createdAt: -1 }
        : { score: -1 };
    return await Lead.find(query).sort(sort);
  }
}

