import type { AIProvider, AIReplyContext, AIReplyResult } from './AIProvider';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    return { text: this.generateText(context), aiProviderUsed: 'mock' };
  }

  private generateText(context: AIReplyContext): string {
    if (context.intent === 'rejection') return 'Entendido. No te enviaré más seguimientos. Gracias por avisarme.';
    if (context.intent === 'meeting') return 'Perfecto. Para programar la reunión necesito tu correo, fecha y hora preferidas.';
    if (context.isNewLead) return '¡Hola! Soy ALMA. Gracias por escribir INFO. Para orientarte mejor, ¿qué resultado buscas conseguir?';
    const previousAI = context.history.filter(message => message.sender === 'ai').map(message => message.text.toLocaleLowerCase('es'));
    if (previousAI.some(text => text.includes('has intentado'))) return 'Gracias por contármelo. ¿Qué tipo de apoyo consideras que te ayudaría más?';
    if (previousAI.some(text => text.includes('principal dificultad'))) return 'Entiendo. ¿Qué has intentado hasta ahora para resolverlo?';
    if (previousAI.some(text => text.includes('resultado buscas'))) return 'Gracias por compartirlo. ¿Cuál es hoy tu principal dificultad para conseguir ese resultado?';
    return 'Gracias por contármelo. ¿Cuál es hoy tu principal dificultad para lograr ese resultado?';
  }
}
