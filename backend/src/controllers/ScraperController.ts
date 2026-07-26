import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { ScraperService } from '../services/ScraperService';
import { HTTP_STATUS } from '../config/constants';
import type { IApiResponse } from '../types/index';

export class ScraperController {
  static async scrapeHashtag(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { hashtag } = req.body;
      const result = await ScraperService.scrapeHashtag(hashtag);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Datos de hashtag obtenidos',
        data: result,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
  }

  static async scrapeProfile(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { username, platform } = req.body;
      const result = await ScraperService.scrapeProfile({ username, platform });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfil scrapeado',
        data: result,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({ success: false, message: error.message });
    }
  }
}
