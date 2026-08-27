import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { evidenceTypes, launchChannels } from '../types/launch';
import {
  externalLaunchEventTypes,
  externalLaunchProviders,
  type ExternalLaunchEventInput,
  type NormalizedExternalLaunchEvent,
} from '../types/launchExternalEvent';
import { LaunchDomainError } from './LaunchDomainError';

export class LaunchExternalEventContract {
  static normalize(
    input: ExternalLaunchEventInput,
    now = new Date()
  ): NormalizedExternalLaunchEvent {
    if (!input || input.schemaVersion !== 1)
      throw new LaunchDomainError(
        'Versión de evento externo no soportada',
        'INVALID_EXTERNAL_EVENT'
      );
    if (
      !externalLaunchProviders.includes(input.provider) ||
      !externalLaunchEventTypes.includes(input.eventType)
    )
      throw new LaunchDomainError(
        'Proveedor o evento externo no soportado',
        'INVALID_EXTERNAL_EVENT'
      );
    if (
      !launchChannels.includes(input.channel) ||
      !String(input.externalEventId || '').trim() ||
      !String(input.externalAccountId || '').trim() ||
      !mongooseId(input.ownerId)
    )
      throw new LaunchDomainError('Identidad externa incompleta', 'INVALID_EXTERNAL_EVENT');
    const providerTimestamp = new Date(input.providerTimestamp),
      receivedAt = new Date(input.receivedAt || now);
    if (Number.isNaN(providerTimestamp.getTime()) || Number.isNaN(receivedAt.getTime()))
      throw new LaunchDomainError('Timestamp externo inválido', 'INVALID_EXTERNAL_TIMESTAMP');
    const tolerance = Math.max(0, input.verification?.timestampToleranceMs ?? 300000);
    if (
      input.provider !== 'fixture' &&
      Math.abs(receivedAt.getTime() - providerTimestamp.getTime()) > tolerance
    )
      throw new LaunchDomainError(
        'Evento externo fuera de tolerancia temporal',
        'EXTERNAL_EVENT_REPLAY'
      );
    if (!input.verification || input.verification.status === 'failed')
      throw new LaunchDomainError('Verificación externa fallida', 'EXTERNAL_VERIFICATION_FAILED');
    if (!['fixture'].includes(input.provider) && input.verification.status !== 'verified')
      throw new LaunchDomainError('Evento externo no verificado', 'EXTERNAL_VERIFICATION_REQUIRED');
    if (
      !input.evidence ||
      !evidenceTypes.includes(input.evidence.type) ||
      (['provider', 'webhook', 'form', 'external', 'import'].includes(input.evidence.type) &&
        !input.evidence.referenceId?.trim())
    )
      throw new LaunchDomainError('Evidencia externa inválida', 'INVALID_EVIDENCE');
    if (
      JSON.stringify(input.normalizedPayload || {}).length > 4000 ||
      JSON.stringify(input.metadata || {}).length > 4000
    )
      throw new LaunchDomainError(
        'Metadata externa demasiado extensa',
        'INVALID_EXTERNAL_METADATA'
      );
    const externalEventId = input.externalEventId.trim(),
      externalAccountId = input.externalAccountId.trim();
    const fingerprintPayload = {
      schemaVersion: input.schemaVersion,
      provider: input.provider,
      eventType: input.eventType,
      externalEventId,
      ownerId: input.ownerId,
      channel: input.channel,
      externalAccountId,
      externalParticipantId: input.externalParticipantId?.trim(),
      providerTimestamp: providerTimestamp.toISOString(),
      normalizedPayload: input.normalizedPayload,
      evidence: input.evidence,
      metadata: input.metadata || {},
    };
    return {
      ...input,
      externalEventId,
      externalAccountId,
      externalParticipantId: input.externalParticipantId?.trim(),
      providerTimestamp,
      receivedAt,
      correlationKey:
        input.correlationKey?.trim() || `${input.provider}:${externalAccountId}:${externalEventId}`,
      payloadFingerprint: createHash('sha256')
        .update(stableStringify(fingerprintPayload))
        .digest('hex'),
      normalizedPayload: { ...input.normalizedPayload },
      metadata: { ...(input.metadata || {}) },
      evidence: {
        ...input.evidence,
        channel: input.evidence.channel || input.channel,
        occurredAt: input.evidence.occurredAt
          ? new Date(input.evidence.occurredAt)
          : providerTimestamp,
      },
    };
  }

  static verifyHmac(
    rawBody: string | Buffer,
    signature: string | undefined,
    secret: string | undefined,
    algorithm = 'sha256'
  ) {
    if (!signature || !secret) return false;
    const supplied = signature.replace(/^sha256=/, '');
    const expected = createHmac(algorithm, secret).update(rawBody).digest('hex');
    if (supplied.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  }
}
const mongooseId = (value: string) => /^[a-f\d]{24}$/i.test(String(value || ''));
const stableStringify = (value: unknown): string => {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
      .join(',')}}`;
  return JSON.stringify(value) ?? 'undefined';
};
