import express from 'express';
import { HunterController } from '../controllers/HunterController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.use(authMiddleware, apiLimiter);

router.post('/search', HunterController.searchProfiles);
router.post('/enrich', HunterController.enrichProfile);
router.get('/opportunities', HunterController.listOpportunities);
router.post('/opportunities', HunterController.saveOpportunity);
router.post('/opportunities/:id/convert', HunterController.convertOpportunity);

export default router;
