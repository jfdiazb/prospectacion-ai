import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';
import { CommercialContextController } from '../controllers/CommercialContextController';

const router = Router();
router.use(authMiddleware, apiLimiter);
router.get('/active', CommercialContextController.active);
router.put('/active', CommercialContextController.replace);
export default router;
