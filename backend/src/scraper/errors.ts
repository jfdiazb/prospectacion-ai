export type ScraperErrorCode =
  | 'VALIDATION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'PROVIDER_TIMEOUT'
  | 'PROVIDER_RATE_LIMIT'
  | 'PROVIDER_UPSTREAM_ERROR'
  | 'PROVIDER_INVALID_RESPONSE';

export type ScraperDiagnosticReason =
  | 'API_KEY_INVALID'
  | 'API_DISABLED'
  | 'API_KEY_RESTRICTED'
  | 'QUOTA_EXCEEDED'
  | 'ACCESS_DENIED'
  | 'INVALID_REQUEST'
  | 'UPSTREAM_REJECTED';

export interface ScraperDiagnostic {
  provider: 'youtube';
  httpStatus: number;
  reason: ScraperDiagnosticReason;
}

const STATUS_BY_CODE: Record<ScraperErrorCode, number> = {
  VALIDATION_ERROR: 400,
  CONFIGURATION_ERROR: 503,
  PROVIDER_TIMEOUT: 504,
  PROVIDER_RATE_LIMIT: 429,
  PROVIDER_UPSTREAM_ERROR: 502,
  PROVIDER_INVALID_RESPONSE: 502,
};

export class ScraperError extends Error {
  readonly status: number;
  readonly cause?: unknown;
  readonly diagnostic?: ScraperDiagnostic;

  constructor(
    readonly code: ScraperErrorCode,
    message: string,
    options?: { cause?: unknown; diagnostic?: ScraperDiagnostic }
  ) {
    super(message);
    this.name = 'ScraperError';
    this.status = STATUS_BY_CODE[code];
    this.cause = options?.cause;
    this.diagnostic = options?.diagnostic;
  }
}

export function asScraperError(error: unknown): ScraperError {
  if (error instanceof ScraperError) return error;
  return new ScraperError('PROVIDER_UPSTREAM_ERROR', 'El proveedor del Social Scraper no está disponible', {
    cause: error,
  });
}
