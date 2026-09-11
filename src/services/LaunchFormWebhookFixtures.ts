import { createHmac } from 'crypto';
import type { LaunchFormWebhookDto } from './LaunchFormWebhookContract';

export class LaunchFormWebhookFixtures {
  static dto(
    launchId: string,
    reference: { participantId?: string; leadId?: string; participantToken?: string },
    overrides: Partial<LaunchFormWebhookDto> = {},
    now = new Date()
  ): LaunchFormWebhookDto {
    const eventType = overrides.eventType || 'registration';
    return {
      schemaVersion: 1,
      eventId: overrides.eventId || `fixture-${eventType}-1`,
      idempotencyKey: overrides.idempotencyKey || `fixture-${eventType}-1`,
      eventType,
      launchId,
      ...reference,
      timestamp: overrides.timestamp || now.toISOString(),
      form: overrides.form || {
        formId: eventType === 'confirmation' ? 'confirmation-form' : 'registration-form',
        submissionId: `submission-${eventType}-1`,
        method: `${eventType}_form` as LaunchFormWebhookDto['form']['method'],
      },
      fields: overrides.fields || { consentAcknowledged: true, sourceCode: 'l6b-fixture' },
    };
  }

  static signed(dto: LaunchFormWebhookDto, secret: string) {
    const rawBody = Buffer.from(JSON.stringify(dto));
    const timestamp = String(Math.floor(new Date(dto.timestamp).getTime() / 1000));
    const signature = `sha256=${createHmac('sha256', secret)
      .update(Buffer.concat([Buffer.from(`${timestamp}.`), rawBody]))
      .digest('hex')}`;
    return {
      rawBody,
      headers: {
        'content-type': 'application/json',
        'x-alma-timestamp': timestamp,
        'x-alma-signature': signature,
        'x-idempotency-key': dto.idempotencyKey,
      },
    };
  }
}
