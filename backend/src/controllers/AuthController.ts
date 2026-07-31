import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { AuthService } from '../services/AuthService';
import { HTTP_STATUS, MESSAGES } from '../config/constants';
import type { IApiResponse } from '../types/index';

/**
 * Controlador de AutenticaciÃ³n
 */
export class AuthController {
  /**
   * POST /auth/register
   */
  static async register(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    console.log(req.body);
    
    try {
      const { email, password, fullName } = req.body;

      const result = await AuthService.register({
        email,
        password,
        fullName,
      });

      res.status(HTTP_STATUS.CREATED).json({
        success: true,
        message: MESSAGES.SUCCESS.CREATED,
        data: result,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /auth/login
   */
  static async login(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { email, password } = req.body;

      const result = await AuthService.login(email, password);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.SUCCESS.LOGIN,
        data: result,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * GET /auth/profile
   */
  static async getProfile(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const
      user = await AuthService.getUserById(req.userId!);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'Perfil obtenido',
        data: user,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.INTERNAL_ERROR).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * PUT /auth/profile
   */
  static async updateProfile(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const user = await AuthService.updateProfile(req.userId!, req.body);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: MESSAGES.SUCCESS.UPDATED,
        data: user,
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }

  /**
   * POST /auth/change-password
   */
  static async changePassword(req: AuthRequest, res: Response<IApiResponse<any>>): Promise<void> {
    try {
      const { oldPassword, newPassword } = req.body;

      await AuthService.changePassword(req.userId!, oldPassword, newPassword);

      res.status(HTTP_STATUS.OK).json({
        success: true,
        message: 'ContraseÃ±a actualizada exitosamente',
      });
    } catch (error: any) {
      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        message: error.message,
      });
    }
  }
}

