import { Router } from 'express';
import { YouTubeController } from '../controllers/YouTubeController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();
router.get('/oauth/callback', YouTubeController.callback);
router.use(authMiddleware, apiLimiter);
router.get('/oauth/connect', YouTubeController.connect);
router.get('/status', YouTubeController.status);
router.patch('/channel', YouTubeController.selectChannel);
router.get('/diagnostics', YouTubeController.diagnostics);
router.get('/monitor', YouTubeController.monitor);
router.post('/monitor/messages/:messageId/retry', YouTubeController.retryMessage);
router.delete('/connection', YouTubeController.disconnect);
export default router;
