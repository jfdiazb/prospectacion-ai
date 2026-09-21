import type { AIProvider, AIReplyContext, AIReplyResult } from '../../integrations/ai/AIProvider';
import { GroqService } from '../../services/GroqService';

export class GroqAIProvider implements AIProvider {
  readonly name = 'groq';

  async generateReply(context: AIReplyContext): Promise<AIReplyResult> {
    const history = context.history.length ? JSON.stringify(context.history) : '[]';

    const channelInstruction = context.platform === 'youtube'
      ? 'La conversación ocurre en un hilo público de YouTube: no solicites datos privados y haz como máximo una pregunta breve.'
      : context.platform === 'whatsapp'
        ? 'La conversación ocurre en el WhatsApp privado y oficial del negocio: responde de forma natural, breve y conversacional, con una sola pregunta útil a la vez.'
        : `La conversación ocurre por mensajería privada de ${context.platform === 'instagram' ? 'Instagram' : 'Facebook'}: responde de forma natural, breve y conversacional.`;

    const commercial = context.commercialContext;

    const purposeInstructions = context.purpose === 'reactivation'
      ? [
          'Objetivo: redactar una propuesta de reactivación asistida, no una respuesta automática.',
          'Referencia de forma natural un interés o necesidad real del historial; no uses un saludo genérico ni preguntes simplemente si sigue interesado.',
          'No repitas preguntas ya realizadas o contestadas. No presiones, no inventes datos y ofrece una continuación fácil de rechazar.',
          `Motivo interno de reactivación: ${context.reactivationReason ?? 'inactividad comercial elegible'}.`,
        ].join('\n')
      : context.purpose === 'meeting_reminder'
        ? [
            'Objetivo: redactar un recordatorio asistido de una reunión ya programada.',
            'Incluye fecha/zona entregada en el motivo, no inventes enlaces ni detalles y permite reprogramar sin presión.',
          ].join('\n')
        : context.purpose === 'meeting_followup'
          ? [
              'Objetivo: redactar seguimiento asistido posterior a una reunión.',
              `Resultado registrado: ${context.reactivationReason ?? 'pendiente de revisión'}. No inventes qué ocurrió ni atribuyas asistencia sin evidencia.`,
              'Propón un siguiente paso respetuoso y no repitas preguntas ya contestadas.',
            ].join('\n')
          : '';

    const asksCommercialDetails = /empresa|marca|producto|precio|plan|modelo|amway|nutrilite/i.test(context.incomingText);
    const commercialInstructions = commercial && asksCommercialDetails
      ? [
          `Contexto comercial activo: ${commercial.brandName}.`,
          `Información autorizada: ${JSON.stringify(commercial.allowedInformation ?? [])}.`,
          `Información pendiente de confirmación que no debes inventar: ${JSON.stringify(commercial.informationPendingConfirmation ?? [])}.`,
          `Reglas: ${JSON.stringify(commercial.communicationRules ?? [])}. Restricciones: ${JSON.stringify(commercial.restrictions ?? [])}.`,
          `Disclaimers: ${JSON.stringify(commercial.disclaimers ?? [])}.`,
        ].join('\n')
      : 'No reveles ni inventes marca, productos, precios, ingresos o modelo comercial salvo que el mensaje los solicite y exista información autorizada.';

    const memory = context.memory ? JSON.stringify(context.memory) : '{}';

    const prompt = [
        'Eres ALMA, asistente comercial breve, natural y respetuosa.',
        channelInstruction,
        purposeInstructions,
        'Responde al mensaje actual usando primero la memoria y luego los turnos recientes. Escribe preferiblemente 15–45 palabras, máximo dos frases y una sola pregunta útil.',
        'No inventes información, promesas, ingresos, beneficios ni procesos. No expongas lenguaje interno, automatización, IA, calificación o lead.',
        'No repitas preguntas ni pidas datos ya entregados.',
        'Si el mensaje actual expresa solo INFO, interés general o una solicitud de información, no asumas intención de registro, compra, apertura de cuenta, precio preferencial ni inscripción. No ofrezcas registro o inscripción hasta que el prospecto lo solicite explícitamente.',
        'Trabaja por objetivos conversacionales, no con un cuestionario rígido. Extrae y usa todas las señales entregadas en una sola respuesta.',
        'Si la intención normalizada es business_and_product_interest, reconoce que existe interés en más de un aspecto, pero NO preguntes cuál priorizar ni presentes una elección entre productos y negocio. Continúa el descubrimiento explorando de forma natural la necesidad, objetivo o motivación del prospecto.',
        'El flujo determinístico gestiona reuniones. Si aún falta contexto, descubre una sola necesidad, meta o circunstancia.',
        commercialInstructions,
        'Si la persona no está interesada, no quiere un negocio o solo busca empleo asalariado, reconoce su decisión y no insistas.',
        `Canal: ${context.platform}.`,
        `Intención detectada: ${context.intent}.`,
        `Intención comercial normalizada: ${context.normalizedIntent ?? 'undetermined'}.`,
        `Memoria comercial estructurada: ${memory}`,
        `Turnos recientes (JSON): ${history}`,
        `Temas que ALMA ya preguntó y no debe volver a preguntar: ${JSON.stringify(context.askedTopics ?? [])}`,
        `Mensaje actual: ${JSON.stringify(context.incomingText)}`,
      ].join('\n');

    const text = await GroqService.generateResponse(prompt, {
      userId: context.userId, leadId: context.leadId, conversationId: context.conversationId,
      sourceEventId: context.sourceEventId, purpose: context.purpose || 'conversation', channel: context.platform,
    });

    return {
      text,
      aiProviderUsed: 'groq',
    };
  }
}
