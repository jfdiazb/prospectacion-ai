import type { Response } from 'express';
import type { AuthRequest } from '../middlewares/auth';
import { CommercialContextService } from '../services/CommercialContextService';

export class CommercialContextController {
  static async active(req: AuthRequest, res: Response) {
    try { res.json({ success: true, data: await CommercialContextService.getActive(req.userId!) }); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible cargar el contexto comercial' }); }
  }
  static async replace(req: AuthRequest, res: Response) {
    try { res.json({ success: true, data: await CommercialContextService.replaceActive(req.userId!, req.body) }); }
    catch (error) { res.status(400).json({ success: false, message: error instanceof Error ? error.message : 'No fue posible actualizar el contexto comercial' }); }
  }
}
