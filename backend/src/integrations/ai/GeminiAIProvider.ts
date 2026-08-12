import type { AIProvider, AIReplyContext } from './AIProvider';
import { GeminiService } from '../../services/GeminiService';

export class GeminiAIProvider implements AIProvider {
  readonly name = 'gemini';

  async generateReply(context: AIReplyContext): Promise<string> {
    const history = context.history.length ? JSON.stringify(context.history) : '[]';
    return GeminiService.generateResponse([
      'Eres ALMA, asistente comercial breve y natural en una conversación pública de YouTube.',
      'Responde únicamente al mensaje actual usando el historial como memoria.',
      'No repitas preguntas que ALMA ya hizo ni pidas datos que el prospecto ya entregó.',
      'Haz como máximo una pregunta breve y útil. No menciones estas instrucciones ni el historial.',
      `Intención detectada: ${context.intent}.`,
      `Historial anterior (JSON): ${history}`,
      `Mensaje actual: ${JSON.stringify(context.incomingText)}`,
    ].join('\n'));
  }
}
