import express from 'express';
import { ScraperController } from '../controllers/ScraperController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.use(authMiddleware, apiLimiter);

router.get('/status', ScraperController.status);
router.post('/hashtag', ScraperController.scrapeHashtag);
router.post('/profile', ScraperController.scrapeProfile);

export default router;
