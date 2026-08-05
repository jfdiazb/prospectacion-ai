import type { AIProvider, AIReplyContext } from './AIProvider';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateReply(context: AIReplyContext): Promise<string> {
    if (context.intent === 'rejection') return 'Entendido. No te enviaré más seguimientos. Gracias por avisarme.';
    if (context.intent === 'meeting') return 'Perfecto. Para programar la reunión necesito tu correo, fecha y hora preferidas.';
    if (context.isNewLead) return '¡Hola! Soy ALMA. Gracias por escribir INFO. Para orientarte mejor, ¿qué resultado buscas conseguir?';
    return 'Gracias por contármelo. ¿Cuál es hoy tu principal dificultad para lograr ese resultado?';
  }
}
