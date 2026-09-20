import OpenAI from 'openai';

export class GroqService {
  static async generateResponse(prompt: string): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey) {
      throw new Error('GROQ_API_KEY no está definida');
    }

    const client = new OpenAI({
      apiKey,
      baseURL: 'https://api.groq.com/openai/v1',
      timeout: Number(process.env.GROQ_TIMEOUT_MS || 15000),
      maxRetries: 1,
    });

    const completion = await client.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-120b',
      max_tokens: Number(process.env.GROQ_MAX_TOKENS || 180),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) throw new Error('Groq devolvió una respuesta vacía');
    return response;
  }
}
