import AutomationFlow from '../models/AutomationFlow';

/**
 * Servicio de Automatizaciones
 */
export class AutomationService {
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
  static async recordExecution(flowId: string): Promise<void> {
    await AutomationFlow.findByIdAndUpdate(flowId, {
      $inc: { 'executionStats.totalExecutions': 1 },
      $set: { 'executionStats.lastExecution': new Date() },
    });
  }
}

