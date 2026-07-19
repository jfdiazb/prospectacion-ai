import { GeminiService } from "../services/GeminiService";

/**
 * Análisis de leads usando Gemini (sin OpenAI)
 */
export const analyzeLead = async (lead: any) => {
  try {
    const prompt = `
Analiza este lead:

Usuario: ${lead.username}
Plataforma: ${lead.platform}
Fuente: ${lead.source}
Acción: ${lead.lastAction || "none"}

Devuelve SOLO JSON válido:
{
  "interestLevel": "cold | warm | hot",
  "intent": "low | medium | high",
  "painPoint": "breve descripción",
  "recommendedMessage": "mensaje corto para iniciar conversación"
}
`;

    const response = await GeminiService.generateResponse(prompt);

    // Intentar convertir a JSON real
    try {
      return JSON.parse(response);
    } catch (parseError) {
      console.warn("⚠️ Gemini no devolvió JSON válido:", response);

      return {
        interestLevel: "cold",
        intent: "low",
        painPoint: "no detectado",
        recommendedMessage: response,
      };
    }

  } catch (error) {
    console.error("❌ Error IA Gemini:", error);
    return null;
  }
};