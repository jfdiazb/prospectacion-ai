import type { Request, Response } from 'express';
import { LaunchExternalEventContract } from '../services/LaunchExternalEventContract';
import { LaunchExternalEventService } from '../services/LaunchExternalEventService';
import { LaunchFormWebhookContract } from '../services/LaunchFormWebhookContract';
import { LaunchDomainError } from '../services/LaunchDomainError';

const header = (req: Request, name: string) => req.header(name)?.trim();
const safeNumber = (
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum ? parsed : fallback;
};

export class LaunchFormWebhookController {
  static async receive(req: Request, res: Response) {
    const startedAt = Date.now();
    const secret = process.env.LAUNCH_FORM_WEBHOOK_SECRET?.trim();
    const ownerId = process.env.LAUNCH_FORM_WEBHOOK_OWNER_ID?.trim();
    const accountId = process.env.LAUNCH_FORM_WEBHOOK_ACCOUNT_ID?.trim() || 'controlled-form';
    if (!secret || !ownerId)
      return res.status(503).json({
        success: false,
        code: 'FORM_WEBHOOK_NOT_CONFIGURED',
        message: 'Webhook de formularios no configurado',
      });
    try {
      const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      if (!rawBody.length)
        throw new LaunchDomainError('Payload de formulario vacío', 'INVALID_FORM_WEBHOOK_PAYLOAD');
      const timestampHeader = header(req, 'x-alma-timestamp');
      const signature = header(req, 'x-alma-signature');
      const idempotencyHeader = header(req, 'x-idempotency-key');
      if (!timestampHeader || !/^\d{10,13}$/.test(timestampHeader))
        throw new LaunchDomainError('Timestamp de firma inválido', 'INVALID_SIGNATURE_TIMESTAMP');
      const timestampValue = Number(timestampHeader);
      const signedAt = new Date(timestampValue < 1e12 ? timestampValue * 1000 : timestampValue);
      const toleranceMs = safeNumber(
        process.env.LAUNCH_FORM_WEBHOOK_TOLERANCE_MS,
        300000,
        30000,
        900000
      );
      if (Math.abs(Date.now() - signedAt.getTime()) > toleranceMs)
        throw new LaunchDomainError(
          'Webhook fuera de tolerancia temporal',
          'EXTERNAL_EVENT_REPLAY'
        );
      const signedPayload = Buffer.concat([Buffer.from(`${timestampHeader}.`, 'utf8'), rawBody]);
      if (!LaunchExternalEventContract.verifyHmac(signedPayload, signature, secret))
        return res.status(401).json({
          success: false,
          code: 'INVALID_WEBHOOK_SIGNATURE',
          message: 'Firma inválida',
        });
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody.toString('utf8'));
      } catch {
        throw new LaunchDomainError('JSON de formulario inválido', 'INVALID_FORM_WEBHOOK_PAYLOAD');
      }
      const dto = LaunchFormWebhookContract.parse(parsed);
      if (!idempotencyHeader || idempotencyHeader !== dto.idempotencyKey)
        throw new LaunchDomainError(
          'Clave de idempotencia ausente o inconsistente',
          'INVALID_IDEMPOTENCY_KEY'
        );
      if (Math.abs(new Date(dto.timestamp).getTime() - signedAt.getTime()) > 1000)
        throw new LaunchDomainError(
          'El timestamp firmado no coincide con el payload',
          'SIGNATURE_TIMESTAMP_MISMATCH'
        );
      const event = await LaunchExternalEventService.ingest(
        LaunchFormWebhookContract.toExternalEvent(dto, ownerId, accountId, toleranceMs),
        new Date()
      );
      console.info('Signed launch form webhook processed', {
        provider: 'form',
        eventId: dto.eventId,
        launch: dto.launchId,
        status: event.status,
        attempts: event.attempts,
        latencyMs: Date.now() - startedAt,
      });
      if (event.status === 'failed')
        return res.status(500).json({
          success: false,
          code: 'FORM_EVENT_PROCESSING_FAILED',
          message: 'El evento quedó disponible para reintento seguro',
        });
      return res.status(event.status === 'processed' ? 200 : 202).json({
        success: true,
        data: { eventId: dto.eventId, status: event.status, attempts: event.attempts },
      });
    } catch (error) {
      const code =
        error instanceof LaunchDomainError
          ? error.code
          : error instanceof Error && error.message === 'EXTERNAL_EVENT_PAYLOAD_CONFLICT'
            ? 'EXTERNAL_EVENT_PAYLOAD_CONFLICT'
            : 'FORM_WEBHOOK_ERROR';
      const status =
        code === 'EXTERNAL_EVENT_PAYLOAD_CONFLICT' || code === 'EXTERNAL_EVENT_REPLAY'
          ? 409
          : code === 'FORM_WEBHOOK_ERROR'
            ? 500
            : 400;
      console.warn('Signed launch form webhook rejected', {
        provider: 'form',
        status: 'rejected',
        code,
        latencyMs: Date.now() - startedAt,
      });
      return res.status(status).json({
        success: false,
        code,
        message: status >= 500 ? 'Error interno del webhook' : 'Evento de formulario rechazado',
      });
    }
  }
}
