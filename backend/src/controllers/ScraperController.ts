import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { ScraperService } from '../services/ScraperService';
import { HTTP_STATUS } from '../config/constants';
import type { IApiResponse } from '../types/index';
import {
  normalizeHashtag,
  type HashtagScrapeResult,
  type ProfileScrapeResult,
} from '../scraper/contracts';
import { ScraperError, asScraperError } from '../scraper/errors';

export class ScraperController {
  static async scrapeHashtag(req: AuthRequest, res: Response<IApiResponse<HashtagScrapeResult>>): Promise<void> {
    try {
      let hashtag: string;
      try {
        hashtag = normalizeHashtag(req.body.hashtag);
      } catch (error) {
        throw new ScraperError('VALIDATION_ERROR', (error as Error).message);
      }
      const result = await ScraperService.scrapeHashtag(hashtag);
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Datos de hashtag obtenidos',
        data: result,
      });
    } catch (error) {
      const scraperError = asScraperError(error);
      res.status(scraperError.status).json({ success: false, message: scraperError.message, error: scraperError.code });
    }
  }

  static async scrapeProfile(req: AuthRequest, res: Response<IApiResponse<ProfileScrapeResult>>): Promise<void> {
    try {
      const { username, platform } = req.body;
      if (typeof username !== 'string' || username.trim().length < 2 || username.trim().length > 100) throw new ScraperError('VALIDATION_ERROR', 'El usuario debe contener entre 2 y 100 caracteres');
      if (!['instagram', 'facebook', 'tiktok', 'youtube'].includes(platform)) throw new ScraperError('VALIDATION_ERROR', 'Plataforma no soportada');
      const result = await ScraperService.scrapeProfile({ username: username.trim(), platform });
      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfil scrapeado',
        data: result,
      });
    } catch (error) {
      const scraperError = asScraperError(error);
      res.status(scraperError.status).json({ success: false, message: scraperError.message, error: scraperError.code });
    }
  }
}
