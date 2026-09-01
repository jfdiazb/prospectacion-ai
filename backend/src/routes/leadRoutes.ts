import { Router } from 'express';
import { LeadController } from '../controllers/LeadController';
import { LeadService } from '../services/LeadService';
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
router.put('/:id/commercial-outcome', async (req: AuthRequest, res, next) => {
  try {
    const outcome = req.body?.outcome;
    if (!['follow_up', 'not_interested', 'client', 'partner'].includes(outcome)) return res.status(400).json({ success: false, message: 'Resultado comercial inválido' });
    const lead = await LeadService.recordCommercialOutcome(req.userId!, req.params.id, outcome, typeof req.body?.sourceMeetingId === 'string' ? req.body.sourceMeetingId : undefined);
    return lead ? res.json({ success: true, data: lead }) : res.status(404).json({ success: false, message: 'Prospecto no encontrado' });
  } catch (error) { next(error); }
});
router.delete('/:id', LeadController.deleteLead);

export default router;
