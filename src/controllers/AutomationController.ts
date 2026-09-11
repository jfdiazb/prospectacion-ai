import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { AutomationService } from '../services/AutomationService';
import { AutomationEngineService } from '../services/AutomationEngineService';

const fail = (res: Response, error: unknown, status = 400) => res.status(status).json({ success: false, message: error instanceof Error ? error.message : 'Solicitud inválida' });
export class AutomationController {
  static async list(req: AuthRequest, res: Response) { try { res.json({ success: true, data: await AutomationService.getUserFlows(req.userId!, req.query) }); } catch (e) { fail(res, e); } }
  static async get(req: AuthRequest, res: Response) { const item = await AutomationService.getFlowById(req.params.id, req.userId!); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Automatización no encontrada' }); }
  static async create(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.createFlow(req.userId!, req.body) }); } catch (e) { fail(res, e); } }
  static async update(req: AuthRequest, res: Response) { try { const item = await AutomationService.updateFlow(req.params.id, req.userId!, req.body); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Automatización no encontrada' }); } catch (e) { fail(res, e); } }
  static async status(req: AuthRequest, res: Response) { try { const item = await AutomationService.setStatus(req.params.id, req.userId!, req.body?.status); return item ? res.json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Automatización no encontrada' }); } catch (e) { fail(res, e); } }
  static async toggle(req: AuthRequest, res: Response) { try { res.json({ success: true, data: await AutomationService.toggleFlow(req.params.id, req.userId!) }); } catch (e) { fail(res, e, 404); } }
  static async duplicate(req: AuthRequest, res: Response) { try { const item = await AutomationService.duplicateFlow(req.params.id, req.userId!); return item ? res.status(201).json({ success: true, data: item }) : res.status(404).json({ success: false, message: 'Automatización no encontrada' }); } catch (e) { fail(res, e); } }
  static async remove(req: AuthRequest, res: Response) { try { const deleted = await AutomationService.deleteFlow(req.params.id, req.userId!); res.status(deleted ? 200 : 404).json({ success: deleted, message: deleted ? 'Automatización eliminada' : 'Automatización no encontrada' }); } catch (e) { fail(res, e); } }
  static async history(req: AuthRequest, res: Response) { try { const items = await AutomationService.history(req.params.id, req.userId!); return items ? res.json({ success: true, data: items }) : res.status(404).json({ success: false, message: 'Automatización no encontrada' }); } catch (e) { fail(res, e); } }
  static async template(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureInfoTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async additionalIncomeTemplate(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureAdditionalIncomeTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async productInterestTemplate(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureProductInterestTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async productSalesTemplate(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureProductSalesTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async businessOpportunityTemplate(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureBusinessOpportunityTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async businessProductTemplate(req: AuthRequest, res: Response) { try { res.status(201).json({ success: true, data: await AutomationService.ensureBusinessProductTemplate(req.userId!) }); } catch (e) { fail(res, e); } }
  static async test(req: AuthRequest, res: Response) { try { const flow = await AutomationService.getFlowById(req.params.id, req.userId!); if (!flow) return res.status(404).json({ success: false, message: 'Automatización no encontrada' }); const event = { ...req.body, userId: req.userId!, eventId: String(req.body?.eventId ?? `manual-${Date.now()}`) }; res.json({ success: true, data: await AutomationEngineService.start(flow, event) }); } catch (e) { fail(res, e); } }
}
