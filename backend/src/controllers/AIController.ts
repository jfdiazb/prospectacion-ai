import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { AIService } from '../services/AIService';
import { HTTP_STATUS } from '../config/constants';
import type { IApiResponse } from '../types/index';

/**
 * Controlador de IA
 */
export class AIController {
  /**
   * POST /ai/generate-message
   */
  static async generateMessage(req: AuthRequest, res: Response<IApiResponse<string>>): Promise<void> {
    try {
      const { username, bio, platform, interestLevel } = req.body;

      const message = await AIService.generatePersonalizedMessage({
        username,
        bio,
        platform,
        interestLevel,
      });

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Mensaje generado',
        data: message,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /ai/analyze-sentiment
   */
  static async analyzeSentiment(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { message } = req.body;

      const analysis = await AIService.analyzeSentiment(message);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'AnÃ¡lisis completado',
        data: analysis,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /ai/detect-intent
   */
  static async detectIntent(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { message } = req.body;

      const intent = await AIService.detectIntent(message);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'IntenciÃ³n detectada',
        data: intent,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /ai/objection-response
   */
  static async generateObjectionResponse(req: AuthRequest, res: Response<IApiResponse<string>>): Promise<void> {
    try {
      const { objection, context } = req.body;

      const response = await AIService.generateObjectionResponse(objection, context);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Respuesta generada',
        data: response,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /ai/analyze-profile
   */
  static async analyzeProfile(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const profileData = req.body;

      const analysis = await AIService.analyzeProspectProfile(profileData);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfil analizado',
        data: analysis,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /ai/viral-ideas
   */
  static async generateViralIdeas(req: AuthRequest, res: Response<IApiResponse<string[]>>): Promise<void> {
    try {
      const { niche, count } = req.body;

      const ideas = await AIService.generateViralContentIdeas(niche, count || 5);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Ideas generadas',
        data: ideas,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }
}

