import express from 'express';
import { LeadController } from '../controllers/LeadController';
import { authMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

/**
 * Todas las rutas requieren autenticaciÃ³n
 */
router.use(authMiddleware, apiLimiter);

/**
 * CRUD bÃ¡sico
 */
router.post('/', LeadController.createLead);
router.get('/', LeadController.getLeads);
router.get('/stats', LeadController.getStats);
router.get('/hot', LeadController.getHotLeads);
router.get('/:id', LeadController.getLeadById);
router.put('/:id', LeadController.updateLead);
router.delete('/:id', LeadController.deleteLead);

/**
 * Rutas especializadas
 */
router.put('/:id/status', LeadController.updateLeadStatus);
router.get('/status/:status', LeadController.getLeadsByStatus);
router.post('/search', LeadController.advancedSearch);

export default router;

