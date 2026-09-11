import { Router } from 'express';
import { MetaController } from '../controllers/MetaController';

const router = Router();
router.get('/webhook', MetaController.verify);
router.post('/webhook', MetaController.receive);
export default router;
