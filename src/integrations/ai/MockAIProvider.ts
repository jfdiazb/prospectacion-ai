import type { AIProvider, AIReplyContext, AIReplyResult } from './AIProvider';

export class MockAIProvider implements AIProvider {
  readonly name = 'mock';

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    return { text: this.generateText(context), aiProviderUsed: 'mock' };
  }

  private generateText(context: AIReplyContext): string {
    const previousAI = context.history.filter(message => message.sender === 'ai').map(message => message.text.toLocaleLowerCase('es'));
    if (context.purpose === 'meeting_reminder') return `Te recuerdo nuestra reunión programada${context.reactivationReason ? ` para ${context.reactivationReason}` : ''}. Si necesitas cambiarla, avísame y la revisamos sin problema.`;
    if (context.purpose === 'meeting_followup') {
      if (context.reactivationReason === 'no_show') return 'No pudimos coincidir en la reunión programada. Si te resulta útil, puedo ayudarte a revisar otro horario sin compromiso.';
      if (context.reactivationReason === 'cancelled') return 'La reunión quedó cancelada. Si más adelante quieres retomarla, podemos revisar un nuevo horario con calma.';
      if (context.reactivationReason === 'technical_failure') return 'La reunión tuvo un inconveniente técnico. Podemos revisar una alternativa o un nuevo horario cuando te resulte conveniente.';
      return 'Gracias por el espacio de la reunión. Dejé registrado el siguiente paso para revisarlo contigo, sin asumir resultados que no hayan sido confirmados.';
    }
    if (context.purpose === 'reactivation') {
      const intent = context.normalizedIntent;
      if (intent === 'additional_income_interest') return 'Retomo lo que comentaste sobre generar ingresos adicionales. Si todavía te resulta útil, puedo ayudarte a explorar las opciones con calma y sin compromiso.';
      if (intent === 'product_interest' || intent === 'product_sales_interest') return 'Retomo tu interés anterior por los productos. Si sigue siendo relevante para ti, puedo continuar desde lo que ya conversamos sin repetir las preguntas anteriores.';
      if (intent === 'business_opportunity' || intent === 'business_and_product_interest') return 'Retomo tu interés anterior en conocer la oportunidad y sus opciones. Si aún es un buen momento, podemos continuar exactamente desde el punto donde quedó la conversación.';
      const lastLead = [...context.history].reverse().find(message => message.sender === 'lead')?.text;
      return lastLead
        ? `Retomo lo que me contaste sobre “${lastLead.slice(0, 120)}”. Si todavía es relevante para ti, podemos continuar desde allí con calma.`
        : 'Retomo nuestra conversación anterior. Si todavía te resulta útil, podemos continuar desde el punto donde quedó, sin compromiso.';
    }
    if (context.intent === 'rejection') return 'Entendido. No te enviaré más seguimientos. Gracias por avisarme.';
    if (context.intent === 'meeting') return 'Perfecto. Para programar la reunión necesito tu correo, fecha y hora preferidas.';
    if (context.normalizedIntent === 'additional_income_interest') return 'Entiendo que buscas una forma de generar ingresos adicionales. Para orientarte sin asumir, ¿te interesa conocer una oportunidad de negocio, una actividad de venta de productos o primero explorar ambas opciones?';
    if (context.normalizedIntent === 'product_interest') return 'Gracias por contármelo. ¿Buscas productos para tu consumo y bienestar, o también te interesa conocer cómo comercializarlos?';
    if (context.normalizedIntent === 'product_sales_interest') {
      const hasContext = context.history.some(message => message.sender === 'lead' && /ya vendo|tengo experiencia|estoy empezando|desde cero|sin experiencia/i.test(message.text));
      return hasContext
        ? 'Gracias por contármelo. ¿Cuál es hoy la principal dificultad que quieres resolver: conseguir clientes, dar seguimiento o cerrar ventas?'
        : 'Entiendo que quieres aprender sobre ventas. ¿Actualmente ya vendes o estás buscando empezar desde cero?';
    }
    if (context.normalizedIntent === 'business_opportunity') return 'Entiendo que te interesa conocer una oportunidad de negocio. ¿Qué te gustaría comprender primero sobre cómo funciona o sobre el tipo de actividad que buscas desarrollar?';
    if (context.normalizedIntent === 'business_and_product_interest') {
      const priorityAsked = previousAI.some(text => (text.includes('productos') && text.includes('negocio')) && (text.includes('prefieres') || text.includes('primero') || text.includes('prioridad')));
      return priorityAsked
        ? 'Perfecto, podemos explorar ambas opciones. ¿Qué resultado concreto te gustaría conseguir al conocerlas?'
        : 'Perfecto, veo que te interesan tanto los productos como la oportunidad. Para orientarte mejor, ¿prefieres empezar por conocer los productos o por entender cómo funciona el modelo de negocio?';
    }
    if (context.isNewLead) return '¡Hola! Soy ALMA. Gracias por tu mensaje. Para orientarte mejor, ¿qué resultado buscas conseguir?';
    if (previousAI.some(text => text.includes('has intentado'))) return 'Gracias por contármelo. ¿Qué tipo de apoyo consideras que te ayudaría más?';
    if (previousAI.some(text => text.includes('principal dificultad'))) return 'Entiendo. ¿Qué has intentado hasta ahora para resolverlo?';
    if (previousAI.some(text => text.includes('resultado buscas'))) return 'Gracias por compartirlo. ¿Cuál es hoy tu principal dificultad para conseguir ese resultado?';
    return 'Gracias por contármelo. ¿Cuál es hoy tu principal dificultad para lograr ese resultado?';
  }
}
