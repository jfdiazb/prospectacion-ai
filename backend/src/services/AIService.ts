import dotenv from 'dotenv';
import { GeminiService } from './GeminiService';

dotenv.config();

/**
 * Servicio de IA (Migrado a Gemini)
 * OpenAI eliminado completamente
 */
export class AIService {
  private static isDemo = false;

  /**
   * Inicializar servicio
   */
  static initialize(): void {
    console.warn('⚠️ AIService migrado a Gemini (OpenAI eliminado)');
    this.isDemo = false;
  }

  /**
   * Generar mensaje personalizado
   */
  static async generatePersonalizedMessage(leadProfile: {
    username: string;
    bio?: string;
    platform: string;
    interestLevel: string;
  }): Promise<string> {
    const prompt = `
Eres un especialista en prospectación para negocios digitales.

Genera un mensaje corto (máx 2 líneas) para:
- Usuario: ${leadProfile.username}
- Plataforma: ${leadProfile.platform}
- Bio: ${leadProfile.bio || 'No disponible'}
- Nivel: ${leadProfile.interestLevel}

Reglas:
- No ser agresivo
- Generar curiosidad
- Invitar conversación
- Ser humano y natural
    `;

    return await GeminiService.generateResponse(prompt);
  }

  /**
   * Analizar sentimiento
   */
  static async analyzeSentiment(message: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    explanation: string;
  }> {
    const prompt = `
Analiza el sentimiento del siguiente mensaje:

"${message}"

Responde SOLO en JSON:
{
  "sentiment": "positive|negative|neutral",
  "score": 0.0,
  "explanation": "breve explicación"
}
    `;

    const response = await GeminiService.generateResponse(prompt);

    try {
      return JSON.parse(response);
    } catch {
      return {
        sentiment: 'neutral',
        score: 0,
        explanation: 'No se pudo analizar correctamente',
      };
    }
  }

  /**
   * Detectar intención
   */
  static async detectIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    suggestedAction: string;
  }> {
    const prompt = `
Clasifica la intención del siguiente mensaje:

"${message}"

Opciones:
- consulta
- interés
- objeción
- rechazo
- información

Responde SOLO en JSON:
{
  "intent": "...",
  "confidence": 0.0,
  "suggestedAction": "..."
}
    `;

    const response = await GeminiService.generateResponse(prompt);

    try {
      return JSON.parse(response);
    } catch {
      return {
        intent: 'consulta',
        confidence: 0.5,
        suggestedAction: 'Responder manualmente',
      };
    }
  }

  /**
   * Responder objeciones
   */
  static async generateObjectionResponse(
    objection: string,
    context?: string
  ): Promise<string> {
    const prompt = `
Un prospecto tiene esta objeción:
"${objection}"

${context ? `Contexto: ${context}` : ''}

Responde:
- Empático
- Breve
- Persuasivo
- Sin vender agresivo
- Invitando a continuar conversación
    `;

    return await GeminiService.generateResponse(prompt);
  }

  /**
   * Analizar perfil de prospecto
   */
  static async analyzeProspectProfile(profileData: {
    bio: string;
    followers?: number;
    engagementRate?: number;
  }): Promise<{
    profileType: string;
    interests: string[];
    recommendedApproach: string;
    score: number;
  }> {
    const prompt = `
Analiza este perfil:

Bio: ${profileData.bio}
Followers: ${profileData.followers || 'N/A'}
Engagement: ${profileData.engagementRate || 'N/A'}

Responde SOLO JSON:
{
  "profileType": "...",
  "interests": [],
  "recommendedApproach": "...",
  "score": 0
}
    `;

    const response = await GeminiService.generateResponse(prompt);

    try {
      return JSON.parse(response);
    } catch {
      return {
        profileType: 'unknown',
        interests: [],
        recommendedApproach: 'contacto directo',
        score: 50,
      };
    }
  }

  /**
   * Ideas de contenido viral
   */
  static async generateViralContentIdeas(
    niche: string,
    count: number = 5
  ): Promise<string[]> {
    const prompt = `
Genera ${count} ideas de contenido viral para: ${niche}

Deben ser:
- Virales
- Para redes sociales
- Con emojis
- Enfocadas en marketing digital

Responde SOLO como array JSON:
["idea1", "idea2"]
    `;

    const response = await GeminiService.generateResponse(prompt);

    try {
      return JSON.parse(response);
    } catch {
      return [`Idea sobre ${niche}`];
    }
  }
}