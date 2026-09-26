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
    let leaseClaimId: string | undefined;
    if (telemetry.userId && telemetry.sourceEventId) {
      const identity = { userId: telemetry.userId, sourceEventId: telemetry.sourceEventId, purpose };
      const existing: any = await AIInvocation.findOne(identity).lean();
      if (existing?.status === 'completed' && existing.responseText) return existing.responseText;
      const configuredLeaseMs = Number(process.env.AI_INVOCATION_LEASE_MS || 120000);
      const leaseMs = Number.isFinite(configuredLeaseMs)
        ? Math.min(900000, Math.max(30000, configuredLeaseMs))
        : 120000;
      const leaseCutoff = new Date(startedAt - leaseMs);
      leaseClaimId = crypto.randomUUID();
      invocation = await AIInvocation.findOneAndUpdate(
        {
          ...identity,
          $or: [
            { status: 'failed' },
            { status: 'processing', processingStartedAt: { $lte: leaseCutoff } },
            { status: 'processing', processingStartedAt: { $exists: false }, updatedAt: { $lte: leaseCutoff } },
          ],
        },
        {
          $set: {
            leadId: telemetry.leadId, conversationId: telemetry.conversationId,
            channel: telemetry.channel, provider: 'groq', model, promptHash,
            status: 'processing', processingStartedAt: new Date(startedAt), leaseClaimId,
          },
          $unset: { failedAt: 1, errorType: 1 },
          $inc: { retryCount: 1 },
        },
        { new: true }
      );
      if (!invocation && !existing) {
        try {
          invocation = await AIInvocation.create({
            ...identity,
            leadId: telemetry.leadId, conversationId: telemetry.conversationId,
            channel: telemetry.channel, provider: 'groq', model, promptHash,
            status: 'processing', processingStartedAt: new Date(startedAt), leaseClaimId,
            retryCount: 0,
          });
        } catch (error: any) {
          if (error?.code !== 11000) throw error;
        }
      }
      if (!invocation) {
        const completed: any = await AIInvocation.findOne(identity).lean();
        if (completed?.status === 'completed' && completed.responseText) return completed.responseText;
        throw new Error('La respuesta IA para este evento ya está en proceso');
      }
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
        if (invocation) void AIInvocation.updateOne(
          { _id: invocation._id, status: 'processing', leaseClaimId },
          {
            $set: { status: 'failed', failedAt: new Date(), errorType: error?.name || 'Error', latencyMs: Date.now() - startedAt },
            $unset: { processingStartedAt: 1, leaseClaimId: 1 },
          }
        );
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
      if (invocation) await AIInvocation.updateOne(
        { _id: invocation._id, status: 'processing', leaseClaimId },
        {
          $set: { status: 'failed', failedAt: new Date(), errorType: 'empty_response', latencyMs: Date.now() - startedAt },
          $unset: { processingStartedAt: 1, leaseClaimId: 1 },
        }
      );
      throw new Error('Groq devolvió una respuesta vacía');
    }
    const reasoningTokens = (completion.usage as any)?.completion_tokens_details?.reasoning_tokens;
    if (invocation) {
      const completed = await AIInvocation.updateOne(
        { _id: invocation._id, status: 'processing', leaseClaimId },
        {
          $set: {
            status: 'completed', responseText: response, completedAt: new Date(),
            promptTokens: completion.usage?.prompt_tokens, completionTokens: completion.usage?.completion_tokens, totalTokens: completion.usage?.total_tokens,
            reasoningTokens, latencyMs: Date.now() - startedAt,
          },
          $unset: { processingStartedAt: 1, leaseClaimId: 1, failedAt: 1, errorType: 1 },
        }
      );
      if (completed.modifiedCount !== 1)
        throw new Error('La invocación IA perdió su lease antes de completar');
    }
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
