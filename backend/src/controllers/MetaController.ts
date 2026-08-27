import crypto from 'crypto';
import type { Request, Response } from 'express';
import { MetaIngestionService } from '../services/MetaIngestionService';

export class MetaController {
  private static validSignature(rawBody: Buffer, signature?: string): boolean {
    const secret = process.env.META_APP_SECRET;
    if (!secret || !signature) return false;
    const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`);
    const received = Buffer.from(signature);
    return expected.length === received.length && crypto.timingSafeEqual(expected, received);
  }

  private static isMockRequest(req: Request): boolean {
    return process.env.NODE_ENV !== 'production'
      && process.env.META_MOCK_MODE === 'true'
      && req.header('x-alma-mock-event') === 'true';
  }

  static verify(req: Request, res: Response) {
    if (!process.env.META_VERIFY_TOKEN) return res.status(503).json({ success: false, message: 'META_VERIFY_TOKEN no configurado' });
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === process.env.META_VERIFY_TOKEN) {
      return res.status(200).send(req.query['hub.challenge']);
    }
    return res.sendStatus(403);
  }

  static async receive(req: Request, res: Response) {
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from(JSON.stringify(req.body));
      const mockRequest = MetaController.isMockRequest(req);
      if (!mockRequest && !process.env.META_APP_SECRET) return res.status(503).json({ success: false, message: 'META_APP_SECRET no configurado' });
      if (!mockRequest && !MetaController.validSignature(rawBody, req.header('x-hub-signature-256'))) return res.status(401).json({ success: false, message: 'Firma de Meta inválida' });
      const payload = JSON.parse(rawBody.toString('utf8'));
      const ownerId = process.env.CRM_OWNER_ID;
      if (!ownerId) throw new Error('CRM_OWNER_ID no configurado');
      const accepted = await MetaIngestionService.acceptPayload(ownerId, payload);
      res.sendStatus(200);
      setImmediate(() => void Promise.all(accepted.map(event => MetaIngestionService.processAccepted(ownerId, event))));
      return;
    } catch (error) {
      console.error('Meta webhook request failed', { errorType: error instanceof Error ? error.name : 'unknown' });
      return res.sendStatus(500);
    }
  }
}
