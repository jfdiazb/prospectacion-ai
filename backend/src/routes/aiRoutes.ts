import express from 'express';
import { AIController } from '../controllers/AIController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

/**
 * Todas las rutas de IA requieren autenticaciÃ³n
 */
router.use(authMiddleware, apiLimiter);

/**
 * Endpoints de IA
 */
router.post('/generate-message', AIController.generateMessage);
router.post('/analyze-sentiment', AIController.analyzeSentiment);
router.post('/detect-intent', AIController.detectIntent);
router.post('/objection-response', AIController.generateObjectionResponse);
router.post('/analyze-profile', AIController.analyzeProfile);
router.post('/viral-ideas', AIController.generateViralIdeas);

export default router;

