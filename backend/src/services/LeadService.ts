import Lead from '../models/Lead';
import type { ILead, IPaginatedResponse, IPaginationParams } from '../types/index';
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
    return await Lead.findOneAndUpdate({ _id: leadId, userId }, updateData, { new: true });
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
    const [totalLeads, newLeads, hotLeads, registeredLeads] = await Promise.all([
      Lead.countDocuments({ userId }),
      Lead.countDocuments({ userId, status: 'new' }),
      Lead.countDocuments({ userId, interestLevel: 'hot' }),
      Lead.countDocuments({ userId, status: 'registered' }),
    ]);

    return {
      totalLeads,
      newLeads,
      hotLeads,
      registeredLeads,
      conversionRate: totalLeads > 0 ? (registeredLeads / totalLeads) * 100 : 0,
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
      searchTerm?: string;
    }
  ): Promise<ILead[]> {
    const query: any = { userId };

    if (filters.status) query.status = filters.status;
    if (filters.platform) query.platform = filters.platform;
    if (filters.interestLevel) query.interestLevel = filters.interestLevel;
    if (filters.minFollowers) query.followers = { $gte: filters.minFollowers };
    if (filters.maxFollowers) query.followers = { ...query.followers, $lte: filters.maxFollowers };
    if (filters.searchTerm) {
      query.$or = [
        { username: { $regex: filters.searchTerm, $options: 'i' } },
        { fullName: { $regex: filters.searchTerm, $options: 'i' } },
        { bio: { $regex: filters.searchTerm, $options: 'i' } },
      ];
    }

    return await Lead.find(query).sort({ score: -1 });
  }
}

