import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.get('/status', authMiddleware, apiLimiter, (_req, res) => {
  const approved = process.env.TIKTOK_API_APPROVED === 'true';
  const ingestionEnabled = approved && process.env.TIKTOK_INGESTION_ENABLED === 'true';
  const messagingEnabled = approved && process.env.TIKTOK_MESSAGING_ENABLED === 'true';
  res.json({
    success: true,
    data: {
      state: ingestionEnabled || messagingEnabled ? 'configured' : 'pending_approval',
      message: ingestionEnabled || messagingEnabled ? 'TikTok configurado mediante APIs oficiales.' : 'Integración pendiente de capacidad/permisos oficiales TikTok.',
      capabilities: { crmRepresentation: true, comments: ingestionEnabled, directMessages: messagingEnabled, outboundReplies: messagingEnabled },
    },
  });
});

export default router;
