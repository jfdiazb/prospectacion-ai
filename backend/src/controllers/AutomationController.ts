import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { AutomationService } from '../services/AutomationService';

export class AutomationController {
  static async list(req: AuthRequest, res: Response) { try { res.json({ success: true, data: await AutomationService.getUserFlows(req.userId!) }); } catch (error: any) { res.status(400).json({ success: false, message: error.message }); } }
  static async create(req: AuthRequest, res: Response) {
    try {
      const name = String(req.body.name || '').trim(); const keyword = String(req.body.keyword || '').trim(); const message = String(req.body.message || '').trim();
      if (name.length < 3 || !keyword || !message) return void res.status(400).json({ success: false, message: 'Nombre, palabra clave y mensaje son obligatorios' });
      const flow = await AutomationService.createFlow(req.userId!, { name, description: req.body.description, trigger: { type: 'keyword', keyword, keywords: [keyword] }, actions: [{ type: 'send_message', message }] });
      res.status(201).json({ success: true, data: flow });
    } catch (error: any) { res.status(400).json({ success: false, message: error.message }); }
  }
  static async toggle(req: AuthRequest, res: Response) { try { res.json({ success: true, data: await AutomationService.toggleFlow(req.params.id, req.userId!) }); } catch (error: any) { res.status(404).json({ success: false, message: error.message }); } }
  static async remove(req: AuthRequest, res: Response) { try { const deleted = await AutomationService.deleteFlow(req.params.id, req.userId!); res.status(deleted ? 200 : 404).json({ success: deleted, message: deleted ? 'Automatización eliminada' : 'Automatización no encontrada' }); } catch (error: any) { res.status(400).json({ success: false, message: error.message }); } }
}
