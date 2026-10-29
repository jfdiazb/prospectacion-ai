import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import { TikTokController } from '../controllers/TikTokController';

const router = Router();

router.get('/oauth/callback', TikTokController.callback);
router.use(authMiddleware, apiLimiter);
router.get('/oauth/connect', TikTokController.connect);
router.get('/status', TikTokController.status);
router.delete('/connection', TikTokController.disconnect);

export default router;
