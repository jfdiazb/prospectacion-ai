import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import TikTokCredential from '../models/TikTokCredential';
import { TikTokOAuthService } from '../integrations/tiktok/TikTokOAuthService';
import { TikTokTokenService } from '../integrations/tiktok/TikTokTokenService';

export class TikTokController {
  static connect(req: AuthRequest, res: Response) {
    res.json({ success: true, data: { authorizationUrl: TikTokOAuthService.authorizationUrl(req.userId!) } });
  }

  static async callback(req: Request, res: Response) {
    try {
      if (typeof req.query.error === 'string') return res.status(400).send('TikTok rechazó la autorización');
      if (typeof req.query.code !== 'string' || typeof req.query.state !== 'string')
        return res.status(400).send('Callback OAuth TikTok incompleto');
      const userId = TikTokOAuthService.verifyState(req.query.state);
      const tokenService = new TikTokTokenService();
      await tokenService.saveAuthorization(userId, await tokenService.exchangeCode(req.query.code));
      const target = new URL(
        process.env.FRONTEND_URL || process.env.CORS_ORIGIN?.split(',')[0] || 'http://localhost:5173'
      );
      target.pathname = '/configuracion';
      target.searchParams.set('tiktok', 'connected');
      return res.redirect(target.toString());
    } catch (error) {
      console.error('TikTok OAuth callback error', {
        message: error instanceof Error ? error.message : 'unknown',
      });
      return res.status(400).send('No fue posible conectar TikTok');
    }
  }

  static async status(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      const credential: any = await TikTokCredential.findOne({ userId: req.userId })
        .select('openId scope connectedAt accessTokenExpiresAt refreshTokenExpiresAt lastAuthFailure')
        .lean();
      const configured = [
        'TIKTOK_CLIENT_KEY',
        'TIKTOK_CLIENT_SECRET',
        'TIKTOK_OAUTH_REDIRECT_URI',
        'TIKTOK_OAUTH_STATE_SECRET',
        'TIKTOK_TOKEN_ENCRYPTION_KEY',
      ].every(key => Boolean(process.env[key]?.trim()));
      const approved = process.env.TIKTOK_API_APPROVED === 'true';
      const ingestionRequested = approved && process.env.TIKTOK_INGESTION_ENABLED === 'true';
      const messagingRequested = approved && process.env.TIKTOK_MESSAGING_ENABLED === 'true';
      const refreshValid = Boolean(credential) &&
        !credential.lastAuthFailure &&
        new Date(credential.refreshTokenExpiresAt).getTime() > Date.now();
      res.json({
        success: true,
        data: {
          state: refreshValid ? 'oauth_connected_transport_unavailable' : configured ? 'oauth_ready' : 'pending_configuration',
          oauth: {
            configured,
            connected: refreshValid,
            reconnectRequired: Boolean(credential) && !refreshValid,
            connectedAt: credential?.connectedAt,
            scopes: credential?.scope ?? [],
          },
          capabilities: {
            loginKit: refreshValid,
            crmRepresentation: true,
            comments: false,
            directMessages: false,
            outboundReplies: false,
          },
          requestedCapabilities: {
            comments: ingestionRequested,
            directMessages: messagingRequested,
            outboundReplies: messagingRequested,
          },
          evidence: { authenticatedTransport: false, webhookOrPoller: false, outboundProvider: false },
        },
      });
    } catch (error) {
      next(error);
    }
  }

  static async disconnect(req: AuthRequest, res: Response, next: NextFunction) {
    try {
      await new TikTokTokenService().revoke(req.userId!);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  }
}
