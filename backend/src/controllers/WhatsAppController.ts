import type { Request, Response } from "express";
import axios from "axios";
import { GeminiService } from "../services/GeminiService";

import { LeadService } from "../services/LeadService";
import { ConversationService } from "../services/ConversationService";
import Lead from "../models/Lead";

export class WhatsAppController {

  static verifyWebhook(req: Request, res: Response) {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === process.env.VERIFY_TOKEN) {
      return res.status(200).send(challenge);
    }

    return res.sendStatus(403);
  }

  static async receiveMessage(req: Request, res: Response) {
    try {
      const message = req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

      if (!message) return res.sendStatus(200);

      const from = message.from;
      const text = message.text?.body;

      const userId = process.env.CRM_OWNER_ID;

if (!userId) {
  throw new Error("CRM_OWNER_ID no configurado");
}

// 🔎 Buscar lead por WhatsApp
let lead = await Lead.findOne({
  phone: from
});


// 👤 Crear lead si no existe
if (!lead) {
  const newLead = await LeadService.createLead(userId, {
    username: from,
    phone: from,
    platform: "whatsapp",
    source: "whatsapp_webhook",
    status: "new",
    tags: []
  });

  lead = await Lead.findById(newLead._id);
}

// 💬 Crear o recuperar conversación
const conversation =
  await ConversationService.getOrCreateConversation(
    userId,
    lead!._id.toString()
  );

// Guardar mensaje del prospecto
await ConversationService.addMessage(
  conversation._id.toString(),
  userId,
  {
    sender: "lead",
    text,
    platform: "whatsapp"
  }
);

      // 🤖 GEMINI
      const aiResponse = await GeminiService.generateResponse(
        `Eres un asistente de ventas. Responde breve y natural: ${text}`
      );

await ConversationService.addMessage(
  conversation._id.toString(),
  userId,
  {
    sender: "ai",
    text: aiResponse,
    platform: "whatsapp"
  }
);

      // 📲 RESPONDER WHATSAPP
      await axios.post(
        `https://graph.facebook.com/v19.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
        {
          messaging_product: "whatsapp",
          to: from,
          text: { body: aiResponse }
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            "Content-Type": "application/json"
          }
        }
      );

      return res.sendStatus(200);

    } catch (error) {
      console.error("WhatsApp webhook error:", error);
      return res.sendStatus(500);
    }
  }
}