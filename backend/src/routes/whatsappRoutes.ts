import express from "express";
import { WhatsAppController } from "../controllers/WhatsAppController";

const router = express.Router();

router.get("/webhook", WhatsAppController.verifyWebhook);
router.post("/webhook", WhatsAppController.receiveMessage);

export default router;