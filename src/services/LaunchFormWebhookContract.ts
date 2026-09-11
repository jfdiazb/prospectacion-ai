import { createHash } from 'crypto';
import type { ExternalLaunchEventInput } from '../types/launchExternalEvent';
import { LaunchDomainError } from './LaunchDomainError';

export const launchFormEventTypes = ['interest', 'registration', 'confirmation'] as const;
export type LaunchFormEventType = (typeof launchFormEventTypes)[number];

export interface LaunchFormWebhookDto {
  schemaVersion: 1;
  eventId: string;
  idempotencyKey: string;
  eventType: LaunchFormEventType;
  launchId: string;
  participantId?: string;
  leadId?: string;
  participantToken?: string;
  timestamp: string;
  form: {
    formId: string;
    submissionId: string;
    method: 'interest_form' | 'registration_form' | 'confirmation_form';
  };
  fields?: {
    consentAcknowledged?: boolean;
    sourceCode?: string;
  };
}

const objectId = (value: unknown) => /^[a-f\d]{24}$/i.test(String(value || ''));
const text = (value: unknown, max: number) =>
  typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max;
const exactKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
  Object.keys(value).every(key => allowed.includes(key));

export class LaunchFormWebhookContract {
  static parse(raw: unknown): LaunchFormWebhookDto {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) this.invalid();
    const input = raw as Record<string, unknown> & Partial<LaunchFormWebhookDto>;
    if (
      !exactKeys(input, [
        'schemaVersion',
        'eventId',
        'idempotencyKey',
        'eventType',
        'launchId',
        'participantId',
        'leadId',
        'participantToken',
        'timestamp',
        'form',
        'fields',
      ]) ||
      input.schemaVersion !== 1 ||
      !launchFormEventTypes.includes(input.eventType as LaunchFormEventType) ||
      !text(input.eventId, 200) ||
      !text(input.idempotencyKey, 300) ||
      !objectId(input.launchId) ||
      !text(input.timestamp, 40)
    )
      this.invalid();
    const references = [input.participantId, input.leadId, input.participantToken].filter(Boolean);
    if (
      references.length !== 1 ||
      (input.participantId && !objectId(input.participantId)) ||
      (input.leadId && !objectId(input.leadId)) ||
      (input.participantToken && !text(input.participantToken, 200))
    )
      throw new LaunchDomainError(
        'Se requiere una única referencia determinista del participante',
        'INVALID_PARTICIPANT_REFERENCE'
      );
    if (!input.form || typeof input.form !== 'object' || Array.isArray(input.form)) this.invalid();
    if (
      !exactKeys(input.form, ['formId', 'submissionId', 'method']) ||
      !text(input.form.formId, 120) ||
      !text(input.form.submissionId, 200) ||
      !['interest_form', 'registration_form', 'confirmation_form'].includes(input.form.method)
    )
      this.invalid();
    const expectedMethod = `${input.eventType}_form`;
    if (input.form.method !== expectedMethod)
      throw new LaunchDomainError(
        'El método del formulario no corresponde al tipo de evento',
        'FORM_EVENT_METHOD_MISMATCH'
      );
    if (input.fields !== undefined) {
      if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields))
        this.invalid();
      if (
        !exactKeys(input.fields, ['consentAcknowledged', 'sourceCode']) ||
        (input.fields.consentAcknowledged !== undefined &&
          typeof input.fields.consentAcknowledged !== 'boolean') ||
        (input.fields.sourceCode !== undefined && !text(input.fields.sourceCode, 80))
      )
        this.invalid();
    }
    if (Number.isNaN(new Date(input.timestamp as string).getTime()))
      throw new LaunchDomainError('Timestamp de formulario inválido', 'INVALID_EXTERNAL_TIMESTAMP');
    const valid = input as LaunchFormWebhookDto;
    return {
      schemaVersion: 1,
      eventId: valid.eventId.trim(),
      idempotencyKey: valid.idempotencyKey.trim(),
      eventType: valid.eventType,
      launchId: valid.launchId,
      participantId: valid.participantId,
      leadId: valid.leadId,
      participantToken: valid.participantToken,
      timestamp: valid.timestamp,
      form: {
        formId: input.form.formId.trim(),
        submissionId: input.form.submissionId.trim(),
        method: input.form.method,
      },
      fields: input.fields
        ? {
            consentAcknowledged: input.fields.consentAcknowledged,
            sourceCode: input.fields.sourceCode?.trim(),
          }
        : undefined,
    };
  }

  static toExternalEvent(
    dto: LaunchFormWebhookDto,
    ownerId: string,
    accountId: string,
    toleranceMs: number,
    receivedAt = new Date()
  ): ExternalLaunchEventInput {
    const eventType = dto.eventType === 'interest' ? 'form_submit' : dto.eventType;
    return {
      schemaVersion: 1,
      provider: 'form',
      eventType,
      externalEventId: dto.eventId,
      ownerId,
      channel: 'manual',
      externalAccountId: accountId,
      externalParticipantId: dto.participantToken
        ? `sha256:${createHash('sha256').update(dto.participantToken).digest('hex')}`
        : undefined,
      providerTimestamp: dto.timestamp,
      receivedAt,
      verification: { status: 'verified', method: 'hmac', timestampToleranceMs: toleranceMs },
      correlationKey: `form:${accountId}:${dto.idempotencyKey}`,
      normalizedPayload: {
        launchId: dto.launchId,
        participantId: dto.participantId,
        leadId: dto.leadId,
        registrationStatus: dto.eventType === 'registration' ? 'registered' : undefined,
        confirmationStatus: dto.eventType === 'confirmation' ? 'confirmed' : undefined,
        contentType: 'form',
        referenceId: dto.form.submissionId,
      },
      evidence: {
        type: 'form',
        source: 'signed_form_webhook',
        channel: 'manual',
        referenceId: dto.form.submissionId,
        occurredAt: new Date(dto.timestamp),
        metadata: {
          provider: 'form',
          externalEventId: dto.eventId,
          method: dto.form.method,
          formId: dto.form.formId,
          consentAcknowledged: dto.fields?.consentAcknowledged ?? null,
          sourceCode: dto.fields?.sourceCode ?? null,
        },
      },
      metadata: {
        ingestionProfile: 'signed_form_v1',
        formId: dto.form.formId,
        method: dto.form.method,
        sourceCode: dto.fields?.sourceCode ?? null,
      },
    };
  }

  private static invalid(): never {
    throw new LaunchDomainError('Payload de formulario inválido', 'INVALID_FORM_WEBHOOK_PAYLOAD');
  }
}
