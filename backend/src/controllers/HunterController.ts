import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { HunterService } from '../services/HunterService';
import { HTTP_STATUS } from '../config/constants';
import type { IApiResponse, IHunterProfile } from '../types/index';

export class HunterController {
  static async searchProfiles(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { keyword, type, minFollowers, maxFollowers, regionCode, publishedAfter, pageToken } = req.body;
      const profiles = await HunterService.searchProfiles({ keyword, type, minFollowers, maxFollowers, regionCode, publishedAfter, pageToken }, req.userId!);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfiles encontrados',
        data: profiles,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
  }

  static async saveOpportunity(req: AuthRequest, res: Response): Promise<void> {
    try { res.status(HTTP_STATUS.CREATED).json({ success: true, message: 'Oportunidad guardada', data: await HunterService.saveOpportunity(req.userId!, req.body) }); }
    catch (error: any) { res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message }); }
  }

  static async listOpportunities(req: AuthRequest, res: Response): Promise<void> {
    try { res.json({ success: true, data: await HunterService.listOpportunities(req.userId!) }); }
    catch (error: any) { res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message }); }
  }

  static async convertOpportunity(req: AuthRequest, res: Response): Promise<void> {
    try { res.json({ success: true, message: 'Oportunidad convertida en lead', data: await HunterService.convertOpportunity(req.userId!, req.params.id) }); }
    catch (error: any) { res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message }); }
  }

  static async enrichProfile(req: AuthRequest, res: Response<IApiResponse<IHunterProfile>>): Promise<void> {
    try {
      const profile = req.body as IHunterProfile;
      const enriched = await HunterService.enrichProfile(profile);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfil enriquecido',
        data: enriched,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
  }
}
