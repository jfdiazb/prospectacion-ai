import OpenAI from 'openai';
import crypto from 'crypto';
import AIInvocation from '../models/AIInvocation';

type Telemetry = { userId?: string; leadId?: string; conversationId?: string; sourceEventId?: string; purpose?: string; channel?: string };

export class GroqService {
  static async generateResponse(prompt: string, telemetry: Telemetry = {}): Promise<string> {
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
    const purpose = telemetry.purpose || 'conversation';
    const promptHash = crypto.createHash('sha256').update(prompt).digest('hex');
    const startedAt = Date.now();
    let invocation: any;
    if (telemetry.userId && telemetry.sourceEventId) {
      const existing: any = await AIInvocation.findOne({ userId: telemetry.userId, sourceEventId: telemetry.sourceEventId, purpose }).lean();
      if (existing?.status === 'completed' && existing.responseText) return existing.responseText;
      if (existing?.status === 'processing') throw new Error('La respuesta IA para este evento ya está en proceso');
      invocation = await AIInvocation.findOneAndUpdate(
        { userId: telemetry.userId, sourceEventId: telemetry.sourceEventId, purpose },
        { $set: { leadId: telemetry.leadId, conversationId: telemetry.conversationId, channel: telemetry.channel, provider: 'groq', model, promptHash, status: 'processing' }, $unset: { failedAt: 1, errorType: 1 } },
        { upsert: true, new: true }
      );
    }
    const completion = await client.chat.completions
      .create({
        model,
        max_completion_tokens: Number(process.env.GROQ_MAX_TOKENS || 384),
        reasoning_effort: 'low',
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      })
      .catch((error: any) => {
        if (invocation) void AIInvocation.updateOne({ _id: invocation._id }, { $set: { status: 'failed', failedAt: new Date(), errorType: error?.name || 'Error', latencyMs: Date.now() - startedAt, retryCount: 1 } });
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
    if (!response) {
      if (invocation) await AIInvocation.updateOne({ _id: invocation._id }, { $set: { status: 'failed', failedAt: new Date(), errorType: 'empty_response', latencyMs: Date.now() - startedAt } });
      throw new Error('Groq devolvió una respuesta vacía');
    }
    const reasoningTokens = (completion.usage as any)?.completion_tokens_details?.reasoning_tokens;
    if (invocation) await AIInvocation.updateOne({ _id: invocation._id }, { $set: {
      status: 'completed', responseText: response, completedAt: new Date(),
      promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, totalTokens: completion.usage?.total_tokens,
      reasoningTokens, latencyMs: Date.now() - startedAt, retryCount: 0,
    } });
    console.info('Groq response generated', {
      event: 'groq_response_generated',
      model,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      reasoningTokens,
      latencyMs: Date.now() - startedAt,
    });
    return response;
  }
}
