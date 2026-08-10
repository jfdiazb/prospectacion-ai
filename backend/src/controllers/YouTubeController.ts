import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import YouTubeCredential from '../models/YouTubeCredential';
import { YouTubeOAuthService } from '../integrations/youtube/YouTubeOAuthService';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';
import { OperationalDiagnosticsService } from '../services/OperationalDiagnosticsService';

export class YouTubeController {
  static connect(req: AuthRequest, res: Response) {
    res.json({ success: true, data: { authorizationUrl: YouTubeOAuthService.authorizationUrl(req.userId!) } });
  }

  static async callback(req: Request, res: Response) {
    try {
      if (typeof req.query.error === 'string') return res.status(400).send('YouTube rechazó la autorización');
      if (typeof req.query.code !== 'string' || typeof req.query.state !== 'string') return res.status(400).send('Callback OAuth incompleto');
      const userId = YouTubeOAuthService.verifyState(req.query.state);
      const tokenService = new YouTubeTokenService();
      await tokenService.saveAuthorization(userId, await tokenService.exchangeCode(req.query.code));
      const target = new URL(process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173');
      target.pathname = '/configuracion'; target.searchParams.set('youtube', 'connected');
      return res.redirect(target.toString());
    } catch (error) {
      console.error('YouTube OAuth callback error', { message: error instanceof Error ? error.message : 'unknown' });
      return res.status(400).send('No fue posible conectar YouTube');
    }
  }

  static async status(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const credential = await YouTubeCredential.findOne({ userId: req.userId }).select('channelId channelTitle connectedAt lastPolledAt');
      res.json({ success: true, data: { connected: Boolean(credential), credential } });
    } catch (error) { next(error); }
  }

  static async diagnostics(req: AuthRequest, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await OperationalDiagnosticsService.getForUser(req.userId!) }); } catch (error) { next(error); }
  }

  static async disconnect(req: AuthRequest, res: Response, next: NextFunction) {
    try { await YouTubeCredential.deleteOne({ userId: req.userId }); res.json({ success: true }); } catch (error) { next(error); }
  }
}
