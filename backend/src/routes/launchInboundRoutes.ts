import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { LaunchFormWebhookController } from '../controllers/LaunchFormWebhookController';

const router = Router();
const formWebhookLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) =>
    res.status(429).json({
      success: false,
      code: 'FORM_WEBHOOK_RATE_LIMITED',
      message: 'Demasiados eventos de formulario',
    }),
});

router.post('/form/webhook', formWebhookLimiter, LaunchFormWebhookController.receive);
export default router;
