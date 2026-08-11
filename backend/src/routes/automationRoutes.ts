import { Router } from 'express';
import { AutomationController } from '../controllers/AutomationController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();
router.use(authMiddleware, apiLimiter);
router.get('/', AutomationController.list);
router.post('/', AutomationController.create);
router.patch('/:id/toggle', AutomationController.toggle);
router.delete('/:id', AutomationController.remove);
export default router;
