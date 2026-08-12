import Conversation from '../models/Conversation';
import type { IMessage } from '../types/index';

/**
 * Servicio de Conversaciones
 */
export class ConversationService {
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

