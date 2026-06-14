import express from 'express';
import { HunterController } from '../controllers/HunterController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.use(authMiddleware, apiLimiter);

router.post('/search', HunterController.searchProfiles);
router.post('/enrich', HunterController.enrichProfile);

export default router;
