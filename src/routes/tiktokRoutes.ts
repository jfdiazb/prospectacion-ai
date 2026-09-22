import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/status', authMiddleware, apiLimiter, (_req, res) => {
  const approved = process.env.TIKTOK_API_APPROVED === 'true';
  const ingestionRequested = approved && process.env.TIKTOK_INGESTION_ENABLED === 'true';
  const messagingRequested = approved && process.env.TIKTOK_MESSAGING_ENABLED === 'true';
  const requested = ingestionRequested || messagingRequested;
  res.json({
    success: true,
    data: {
      state: requested ? 'pending_configuration' : 'pending_approval',
      message: requested
        ? 'TikTok fue habilitado mediante variables, pero ALMA no tiene transporte oficial autenticado configurado.'
        : 'Integración pendiente de capacidad/permisos oficiales TikTok.',
      capabilities: { crmRepresentation: true, comments: false, directMessages: false, outboundReplies: false },
      requestedCapabilities: { comments: ingestionRequested, directMessages: messagingRequested, outboundReplies: messagingRequested },
      evidence: { authenticatedTransport: false, webhookOrPoller: false, outboundProvider: false },
    },
  });
});

export default router;
