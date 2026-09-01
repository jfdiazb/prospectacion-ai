import crypto from 'crypto';

export type MetaObservationStage =
  | 'received'
  | 'signature'
  | 'platform'
  | 'normalization'
  | 'idempotency'
  | 'persistence'
  | 'crm_interaction'
  | 'proposal'
  | 'processing';

type MetaObservation = {
  correlationId: string;
  stage: MetaObservationStage;
  code: string;
  platform?: 'instagram' | 'facebook' | 'unknown';
  eventFingerprint?: string;
  normalizedCount?: number;
  acceptedCount?: number;
  hasSignature?: boolean;
};

const fingerprint = (value: string | Buffer): string =>
  crypto.createHash('sha256').update(value).digest('hex').slice(0, 24);

export const metaWebhookCorrelationId = (rawBody: Buffer): string =>
  `meta_req_${fingerprint(rawBody)}`;

export const metaEventFingerprint = (correlationId: string, externalEventId: string): string =>
  `meta_evt_${fingerprint(`${correlationId}:${externalEventId}`)}`;

export const observeMeta = (
  observation: MetaObservation,
  level: 'info' | 'warn' | 'error' = 'info'
): void => {
  console[level]('Meta webhook observability', {
    event: 'meta_webhook_observability',
    ...observation,
  });
};
