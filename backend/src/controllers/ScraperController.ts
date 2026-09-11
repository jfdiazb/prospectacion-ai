import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { ScraperService } from '../services/ScraperService';
import { HTTP_STATUS } from '../config/constants';
import type { IApiResponse } from '../types/index';

export class ScraperController {
  static async scrapeHashtag(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { hashtag } = req.body;
      if (typeof hashtag !== 'string' || !/^[\p{L}\p{N}_-]{2,64}$/u.test(hashtag.replace(/^#/, ''))) throw new Error('El hashtag debe contener entre 2 y 64 caracteres válidos');
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
      if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 100) throw new Error('El usuario debe contener entre 2 y 100 caracteres');
      if (!['instagram', 'facebook', 'tiktok', 'youtube'].includes(platform)) throw new Error('Plataforma no soportada');
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
