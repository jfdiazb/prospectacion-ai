import AutomationFlow from '../models/AutomationFlow';

/**
 * Servicio de Automatizaciones
 */
export class AutomationService {
  static normalizeKeyword(value: string): string {
    return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es').trim();
  }

  static textMatchesKeyword(text: string, keyword: string): boolean {
    const normalizedText = this.normalizeKeyword(text);
    const normalizedKeyword = this.normalizeKeyword(keyword);
    if (!normalizedKeyword) return false;
    const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}([^\\p{L}\\p{N}_]|$)`, 'u').test(normalizedText);
  }

  static async findMatchingKeywordFlow(userId: string, text: string): Promise<any | null> {
    const flows = await AutomationFlow.find({ userId, isActive: true, 'trigger.type': 'keyword' }).sort({ createdAt: 1 });
    return flows.find(flow => {
      const keywords = [...(flow.trigger?.keywords ?? []), flow.trigger?.keyword]
        .filter((keyword: string | undefined): keyword is string => Boolean(keyword));
      return keywords.some(keyword => this.textMatchesKeyword(text, keyword));
    }) ?? null;
  }

  static getReply(flow: any): string | null {
    const action = flow?.actions?.find((item: any) => item.type === 'send_message' && item.message?.trim());
    return action?.message?.trim() ?? null;
  }

  /**
   * Crear flujo de automatizaciÃ³n
   */
  static async createFlow(userId: string, flowData: any): Promise<any> {
    return await AutomationFlow.create({
      ...flowData,
      userId,
      isActive: true,
    });
  }

  /**
   * Obtener flujos del usuario
   */
  static async getUserFlows(userId: string): Promise<any[]> {
    return await AutomationFlow.find({ userId }).sort({ createdAt: -1 });
  }

  /**
   * Obtener flujo por ID
   */
  static async getFlowById(flowId: string, userId: string): Promise<any> {
    return await AutomationFlow.findOne({ _id: flowId, userId });
  }

  /**
   * Actualizar flujo
   */
  static async updateFlow(flowId: string, userId: string, updateData: any): Promise<any> {
    return await AutomationFlow.findOneAndUpdate(
      { _id: flowId, userId },
      updateData,
      { new: true }
    );
  }

  /**
   * Eliminar flujo
   */
  static async deleteFlow(flowId: string, userId: string): Promise<boolean> {
    const result = await AutomationFlow.deleteOne({ _id: flowId, userId });
    return result.deletedCount > 0;
  }

  /**
   * Activar/Desactivar flujo
   */
  static async toggleFlow(flowId: string, userId: string): Promise<any> {
    const flow = await this.getFlowById(flowId, userId);
    if (!flow) throw new Error('Flow no encontrado');

    return await AutomationFlow.findOneAndUpdate(
      { _id: flowId, userId },
      { isActive: !flow.isActive },
      { new: true }
    );
  }

  /**
   * Obtener flujos activos
   */
  static async getActiveFlows(userId: string): Promise<any[]> {
    return await AutomationFlow.find({ userId, isActive: true });
  }

  /**
   * Registrar ejecuciÃ³n de flujo
   */
  static async recordExecution(flowId: string, userId: string, successful: boolean): Promise<void> {
    await AutomationFlow.findOneAndUpdate({ _id: flowId, userId }, {
      $inc: { 'executionStats.totalExecutions': 1, [`executionStats.${successful ? 'successfulExecutions' : 'failedExecutions'}`]: 1 },
      $set: { 'executionStats.lastExecution': new Date() },
    });
  }
}

