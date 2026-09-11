import { Router } from 'express';
import { CalendlyController } from '../controllers/CalendlyController';

const router = Router();
router.post('/webhook', CalendlyController.receive);
export default router;
