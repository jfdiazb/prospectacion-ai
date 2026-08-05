import type { AIProvider, AIReplyContext } from './AIProvider';
import { GeminiService } from '../../services/GeminiService';

export class GeminiAIProvider implements AIProvider {
  readonly name = 'gemini';

  async generateReply(context: AIReplyContext): Promise<string> {
    return GeminiService.generateResponse(`Eres ALMA, asistente comercial breve y natural. Intención: ${context.intent}. Mensaje: ${context.incomingText}`);
  }
}
