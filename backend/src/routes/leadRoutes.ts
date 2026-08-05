import { Router } from 'express';
import { LeadController } from '../controllers/LeadController';
import { analyzeLead } from '../ai/leadAnalyzer';
import { authMiddleware, type AuthRequest } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = Router();

router.use(authMiddleware, apiLimiter);

router.get('/', LeadController.getLeads);
router.get('/stats', LeadController.getStats);
router.get('/hot', LeadController.getHotLeads);
router.post('/search', LeadController.advancedSearch);
router.post('/', LeadController.createLead);
router.post('/analyze', async (req: AuthRequest, res, next) => {
  try {
    const analysis = await analyzeLead(req.body);
    res.status(200).json({ success: true, message: 'Lead analizado', data: analysis });
  } catch (error) {
    next(error);
  }
});
router.get('/status/:status', LeadController.getLeadsByStatus);
router.get('/:id', LeadController.getLeadById);
router.put('/:id', LeadController.updateLead);
router.put('/:id/status', LeadController.updateLeadStatus);
router.delete('/:id', LeadController.deleteLead);

export default router;
