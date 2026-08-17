import Conversation from '../models/Conversation';
import crypto from 'crypto';
import type { IMessage } from '../types/index';

/**
 * Servicio de Conversaciones
 */
export class ConversationService {
  static normalizeAIText(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').replace(/[^a-z0-9]+/g, ' ').trim();
  }

  static fingerprintAIText(value: string): string {
    return crypto.createHash('sha256').update(this.normalizeAIText(value)).digest('hex');
  }

  static classifyQuestionTopic(value: string): string | undefined {
    const text = this.normalizeAIText(value);
    if (/que (resultado|cambio)|resultado (buscas|quieres|concreto)|gustaria conseguir/.test(text)) return 'desired_outcome';
    if (/(principal )?(dificultad|obstaculo)|que te esta frenando/.test(text)) return 'main_obstacle';
    if (/que has intentado|que has probado|acciones has realizado/.test(text)) return 'previous_attempts';
    if (/tipo de (apoyo|ayuda)|apoyo consideras|ayuda necesitas/.test(text)) return 'support_needed';
    if (/(cuando|plazo).*(conseguir|lograr)|para cuando/.test(text)) return 'desired_timing';
    if (/(presupuesto|inversion).*(tienes|disponible)|cuanto.*invertir/.test(text)) return 'budget';
    return undefined;
  }

  static async getOrInitializeAIMemory(conversationId: string, userId: string): Promise<{ askedTopics: string[]; responseFingerprints: string[] }> {
    const conversation: any = await Conversation.findOne({ _id: conversationId, userId })
      .select('messages aiAskedTopics aiResponseFingerprints aiMemoryInitializedAt').lean();
    if (!conversation) return { askedTopics: [], responseFingerprints: [] };
    const askedTopics = new Set<string>(conversation.aiAskedTopics ?? []);
    const responseFingerprints = new Set<string>(conversation.aiResponseFingerprints ?? []);
    if (!conversation.aiMemoryInitializedAt) {
      for (const message of conversation.messages ?? []) {
        if (message.sender !== 'ai' || typeof message.text !== 'string') continue;
        responseFingerprints.add(this.fingerprintAIText(message.text));
        const topic = this.classifyQuestionTopic(message.text);
        if (topic) askedTopics.add(topic);
      }
      await Conversation.updateOne({ _id: conversationId, userId, aiMemoryInitializedAt: { $exists: false } }, {
        $addToSet: { aiAskedTopics: { $each: [...askedTopics] }, aiResponseFingerprints: { $each: [...responseFingerprints] } },
        $set: { aiMemoryInitializedAt: new Date() },
      });
    }
    return { askedTopics: [...askedTopics], responseFingerprints: [...responseFingerprints] };
  }

  static async reserveAIResponse(conversationId: string, userId: string, text: string): Promise<boolean> {
    const fingerprint = this.fingerprintAIText(text);
    const topic = this.classifyQuestionTopic(text);
    const query: any = { _id: conversationId, userId, aiResponseFingerprints: { $ne: fingerprint } };
    if (topic) query.aiAskedTopics = { $ne: topic };
    const additions: any = { aiResponseFingerprints: fingerprint };
    if (topic) additions.aiAskedTopics = topic;
    const result = await Conversation.updateOne(query, { $addToSet: additions });
    return result.modifiedCount === 1;
  }
  /**
   * Crear o obtener conversaciÃ³n
   */
  static async getOrCreateConversation(
    userId: string,
    leadId: string
  ): Promise<any> {
    let conversation = await Conversation.findOne({ userId, leadId });

    if (!conversation) {
      conversation = await Conversation.create({
        userId,
        leadId,
        messages: [],
        status: 'active',
      });
    }

    return conversation;
  }

  /**
   * Agregar mensaje a conversaciÃ³n
   */
  static async addMessage(
    conversationId: string,
    userId: string,
    message: Omit<IMessage, 'timestamp'>
  ): Promise<any> {
    const conversation = await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      {
        $push: {
          messages: {
            ...message,
            timestamp: new Date(),
          },
        },
        $set: { lastMessage: new Date() },
      },
      { new: true }
    );

    return conversation;
  }

  /**
   * Obtener conversaciÃ³n con lead
   */
  static async getConversation(conversationId: string, userId: string): Promise<any> {
    return await Conversation.findOne({ _id: conversationId, userId });
  }

  static async getRecentMessages(conversationId: string, userId: string, limit = 12): Promise<any[]> {
    const conversation: any = await Conversation.findOne({ _id: conversationId, userId })
      .slice('messages', -Math.max(1, Math.min(20, limit)))
      .select('messages')
      .lean();
    return conversation?.messages ?? [];
  }

  static async getControlMode(conversationId: string, userId: string): Promise<'automated' | 'handoff_requested' | 'human_controlled'> {
    const conversation: any = await Conversation.findOne({ _id: conversationId, userId }).select('controlMode').lean();
    return conversation?.controlMode ?? 'automated';
  }

  /**
   * Obtener todas las conversaciones del usuario
   */
  static async getUserConversations(userId: string): Promise<any[]> {
    return await Conversation.find({ userId }).sort({ lastMessage: -1 });
  }

  /**
   * Cerrar conversaciÃ³n
   */
  static async closeConversation(conversationId: string, userId: string): Promise<any> {
    return await Conversation.findOneAndUpdate(
      { _id: conversationId, userId },
      { status: 'closed' },
      { new: true }
    );
  }

  /**
   * Marcar mensajes como leÃ­dos
   */
  static async markAsRead(conversationId: string, userId: string): Promise<void> {
    await Conversation.updateOne(
      { _id: conversationId, userId },
      { $set: { 'messages.$[].isRead': true } }
    );
  }

  /**
   * Obtener conversaciones no leÃ­das
   */
  static async getUnreadConversations(userId: string): Promise<number> {
    const count = await Conversation.countDocuments({
      userId,
      'messages.isRead': false,
    });
    return count;
  }
}

