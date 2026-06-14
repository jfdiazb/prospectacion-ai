import { OpenAI } from 'openai';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Servicio de IA (OpenAI)
 */
export class AIService {
  private static openai: OpenAI;

  /**
   * Inicializar cliente OpenAI
   */
  static initialize(): void {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is required to initialize AIService.');
    }

    this.openai = new OpenAI({
      apiKey,
    });
  }

  private static ensureInitialized(): void {
    if (!this.openai) {
      this.initialize();
    }
  }

  /**
   * Generar respuesta personalizada
   */
  static async generatePersonalizedMessage(leadProfile: {
    username: string;
    bio?: string;
    platform: string;
    interestLevel: string;
  }): Promise<string> {
    const prompt = `
      Soy un especialista en prospectación para network marketing y negocios digitales.
      
      Necesito generar un mensaje personalizado y humanizado para contactar a un prospecto:
      - Usuario: ${leadProfile.username}
      - Plataforma: ${leadProfile.platform}
      - Biografía: ${leadProfile.bio || 'No disponible'}
      - Nivel de interés: ${leadProfile.interestLevel}
      
      Genera un mensaje corto (máximo 2 líneas), natural, sin ser demasiado comercial.
      El mensaje debe:
      1. Ser personalizado basado en su perfil
      2. Generar curiosidad sin ser invasivo
      3. Invitar a iniciar una conversación
      
      Responde SOLO con el mensaje, sin explicaciones adicionales.
    `;

    this.ensureInitialized();
    const message = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 150,
    });

    return message.choices[0].message.content || '';
  }

  /**
   * Analizar sentimiento de mensaje
   */
  static async analyzeSentiment(message: string): Promise<{
    sentiment: 'positive' | 'negative' | 'neutral';
    score: number;
    explanation: string;
  }> {
    const prompt = `
      Analiza el sentimiento del siguiente mensaje y proporciona:
      1. Sentimiento (positive, negative, neutral)
      2. Score (-1 a 1)
      3. Explicación breve
      
      Mensaje: "${message}"
      
      Responde en formato JSON:
      {
        "sentiment": "positive|negative|neutral",
        "score": 0.0,
        "explanation": "..."
      }
    `;

    this.ensureInitialized();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  }

  /**
   * Detectar intención del prospecto
   */
  static async detectIntent(message: string): Promise<{
    intent: string;
    confidence: number;
    suggestedAction: string;
  }> {
    const prompt = `
      Detecta la intención del siguiente mensaje de un prospecto.
      Intenciones posibles: consulta, objeción, interés, rechazo, información.
      
      Mensaje: "${message}"
      
      Responde en JSON:
      {
        "intent": "...",
        "confidence": 0.0-1.0,
        "suggestedAction": "..."
      }
    `;

    this.ensureInitialized();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  }

  /**
   * Generar respuesta automática a objeción
   */
  static async generateObjectionResponse(objection: string, context?: string): Promise<string> {
    const prompt = `
      Un prospecto ha presentado la siguiente objeción:
      "${objection}"
      
      ${context ? `Contexto adicional: ${context}` : ''}
      
      Genera una respuesta profesional, empática y persuasiva que:
      1. Valide su preocupación
      2. Proporcione evidencia o argumentos
      3. Invite a continuar la conversación
      
      Responde SOLO con la respuesta, sin explicaciones.
    `;

    this.ensureInitialized();
    const message = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 200,
    });

    return message.choices[0].message.content || '';
  }

  /**
   * Analizar perfil de prospecto
   */
  static async analyzeProspectProfile(profileData: {
    bio: string;
    followers?: number;
    engagementRate?: number;
    recentPosts?: string[];
  }): Promise<{
    profileType: string;
    interests: string[];
    recommendedApproach: string;
    score: number;
  }> {
    const prompt = `
      Analiza el perfil de un prospecto potencial basado en:
      
      Biografía: ${profileData.bio}
      Seguidores: ${profileData.followers || 'N/A'}
      Engagement: ${profileData.engagementRate || 'N/A'}
      
      Proporciona un análisis en JSON con:
      {
        "profileType": "...",
        "interests": [...],
        "recommendedApproach": "...",
        "score": 0-100
      }
    `;

    this.ensureInitialized();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      max_tokens: 300,
    });

    const content = response.choices[0].message.content || '{}';
    return JSON.parse(content);
  }

  /**
   * Generar ideas de contenido viral
   */
  static async generateViralContentIdeas(niche: string, count: number = 5): Promise<string[]> {
    const prompt = `
      Genera ${count} ideas de contenido viral para la niche de "${niche}".
      
      Las ideas deben ser:
      1. Atractivas y con alto potencial de engagement
      2. Relevantes para redes sociales
      3. Prácticas para network marketing/negocios digitales
      4. Con emojis incluidos
      
      Responde con una lista JSON:
      ["idea 1", "idea 2", ...]
    `;

    this.ensureInitialized();
    const response = await this.openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 500,
    });

    const content = response.choices[0].message.content || '[]';
    return JSON.parse(content);
  }
}

