import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { LeadService } from '../services/LeadService';
import { HTTP_STATUS, MESSAGES } from '../config/constants';
import type { IApiResponse, IPaginatedResponse, ILead } from '../types/index';


/**
 * Controlador de Leads
 */
export class LeadController {
  /**
   * POST /leads
   */
  static async createLead(req: AuthRequest, res: Response<IApiResponse<ILead>>): Promise<void> {
    try {
      const lead = await LeadService.createLead(req.userId!, req.body);

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: MESSAGES.SUCCESS.CREATED,
        data: lead,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /leads
   */
  static async getLeads(req: AuthRequest, res: Response<IApiResponse<IPaginatedResponse<ILead>>>): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      const leads = await LeadService.getUserLeads(req.userId!, { page, limit });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Leads obtenidos',
        data: leads,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /leads/hot
   */
  static async getHotLeads(req: AuthRequest, res: Response<IApiResponse<ILead[]>>): Promise<void> {
    try {
      const leads = await LeadService.getHotLeads(req.userId!);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Leads calientes obtenidos',
        data: leads,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /leads/:id
   */
  static async getLeadById(req: AuthRequest, res: Response<IApiResponse<ILead>>): Promise<void> {
    try {
      const lead = await LeadService.getLeadById(req.params.id, req.userId!);

      if (!lead) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: MESSAGES.ERROR.NOT_FOUND,
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Lead obtenido',
        data: lead ?? undefined,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * PUT /leads/:id
   */
  static async updateLead(req: AuthRequest, res: Response<IApiResponse<ILead>>): Promise<void> {
    try {
      const lead = await LeadService.updateLead(req.params.id, req.userId!, req.body);

      if (!lead) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: MESSAGES.ERROR.NOT_FOUND,
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.SUCCESS.UPDATED,
        data: lead,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * DELETE /leads/:id
   */
  static async deleteLead(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const deleted = await LeadService.deleteLead(req.params.id, req.userId!);

      if (!deleted) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: MESSAGES.ERROR.NOT_FOUND,
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.SUCCESS.DELETED,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /leads/status/:status
   */
  static async getLeadsByStatus(req: AuthRequest, res: Response<IApiResponse<ILead[]>>): Promise<void> {
    try {
      const leads = await LeadService.getLeadsByStatus(req.userId!, req.params.status);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Leads obtenidos',
        data: leads,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * PUT /leads/:id/status
   */
  static async updateLeadStatus(req: AuthRequest, res: Response<IApiResponse<ILead>>): Promise<void> {
    try {
      const { status } = req.body;
      const lead = await LeadService.updateLeadStatus(req.params.id, req.userId!, status);

      if (!lead) {
        res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: MESSAGES.ERROR.NOT_FOUND,
        });
        return;
      }

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Estado actualizado',
        data: lead,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /leads/stats
   */
  static async getStats(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const stats = await LeadService.getLeadStats(req.userId!);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'EstadÃ­sticas obtenidas',
        data: stats,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /leads/search
   */
  static async advancedSearch(req: AuthRequest, res: Response<IApiResponse<ILead[]>>): Promise<void> {
    try {
      const leads = await LeadService.advancedSearch(req.userId!, req.body);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'BÃºsqueda completada',
        data: leads,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }
}

