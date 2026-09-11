import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import YouTubeCredential from '../models/YouTubeCredential';
import { YouTubeOAuthService } from '../integrations/youtube/YouTubeOAuthService';
import { YouTubeTokenService } from '../integrations/youtube/YouTubeTokenService';
import { OperationalDiagnosticsService } from '../services/OperationalDiagnosticsService';
import { YouTubeMonitorService } from '../services/YouTubeMonitorService';
import { MessagingService } from '../services/MessagingService';
import { isYouTubePollingEnabled } from '../services/YouTubeIngestionService';

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
      const credential: any = await YouTubeCredential.findOne({ userId: req.userId })
        .select('channelId channelTitle channelHandle authorizedChannelId authorizedChannelTitle authorizedChannelHandle connectedAt lastPolledAt lastPollingFailure')
        .lean();
      const reconnectRequired = credential?.lastPollingFailure?.operation === 'oauth_refresh';
      res.json({
        success: true,
        data: {
          connected: Boolean(credential) && !reconnectRequired,
          reconnectRequired,
          pollingEnabled: isYouTubePollingEnabled(),
          inboundMode: process.env.YOUTUBE_INGESTION_MODE || 'mock',
          outboundMode:
            process.env.NODE_ENV === 'production' && process.env.REAL_OUTBOUND_ENABLED !== 'true'
              ? 'mock'
              : process.env.YOUTUBE_MESSAGING_MODE || 'mock',
          credential: credential
            ? {
                channelId: credential.channelId,
                channelTitle: credential.channelTitle,
                channelHandle: credential.channelHandle,
                authorizedChannelId: credential.authorizedChannelId || credential.channelId,
                authorizedChannelTitle: credential.authorizedChannelTitle || credential.channelTitle,
                authorizedChannelHandle: credential.authorizedChannelHandle || credential.channelHandle,
                connectedAt: credential.connectedAt,
                lastPolledAt: credential.lastPolledAt,
              }
            : null,
        },
      });
    } catch (error) { next(error); }
  }

  static async selectChannel(req: AuthRequest, res: Response) {
    try {
      const handle = typeof req.body?.handle === 'string' ? req.body.handle : '';
      const channel = await new YouTubeTokenService().selectMonitoredChannel(req.userId!, handle);
      res.json({ success: true, data: { channelId: channel.id, channelTitle: channel.snippet?.title, channelHandle: channel.snippet?.customUrl } });
    } catch (error) {
      res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible seleccionar el canal' });
    }
  }

  static async diagnostics(req: AuthRequest, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await OperationalDiagnosticsService.getForUser(req.userId!) }); } catch (error) { next(error); }
  }

  static async monitor(req: AuthRequest, res: Response, next: NextFunction) {
    try { res.json({ success: true, data: await YouTubeMonitorService.getForUser(req.userId!) }); } catch (error) { next(error); }
  }

  static async retryMessage(req: AuthRequest, res: Response) {
    try { res.json({ success: true, data: await MessagingService.retryFailedYouTube(req.params.messageId, req.userId!) }); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible reintentar el mensaje' }); }
  }

  static async disconnect(req: AuthRequest, res: Response, next: NextFunction) {
    try { await YouTubeCredential.deleteOne({ userId: req.userId }); res.json({ success: true }); } catch (error) { next(error); }
  }
}
