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

    const model = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
    const completion = await client.chat.completions
      .create({
        model,
        max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS || 512),
        reasoning_effort: 'low',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      .catch((error: any) => {
        console.error('Groq request failed', {
          event: 'groq_request_failed',
          model,
          errorType: error?.name || 'Error',
          status: typeof error?.status === 'number' ? error.status : undefined,
          code: typeof error?.code === 'string' ? error.code : undefined,
          maxRetries: 1,
        });
        throw error;
      });

    const response = completion.choices[0]?.message?.content?.trim();
    if (!response) throw new Error('Groq devolvió una respuesta vacía');
    console.info('Groq response generated', {
      event: 'groq_response_generated',
      model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
    });
    return response;
  }
}
