import express from "express";
import { WhatsAppController } from "../controllers/WhatsAppController";
import { authMiddleware, roleMiddleware } from '../middlewares/auth';
import { apiLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

router.get("/webhook", WhatsAppController.verifyWebhook);
router.post("/webhook", WhatsAppController.receiveMessage);
router.get('/admin/inbound-diagnostics', authMiddleware, roleMiddleware(['admin']), apiLimiter, WhatsAppController.inboundDiagnostics);

export default router;
