import type { Request, Response } from "express";
import axios from "axios";
//import { GeminiService } from "../services/GeminiService";
import { GoogleGenerativeAI } from "@google/generative-ai";

export class GeminiService {
  static async generateResponse(prompt: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY no está definida');

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-2.0-flash' });

    const result = await model.generateContent(prompt);
    const response = await result.response;

    return response.text();
  }
}

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

      // 🤖 GEMINI
      const aiResponse = await GeminiService.generateResponse(
        `Eres un asistente de ventas. Responde breve y natural: ${text}`
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
