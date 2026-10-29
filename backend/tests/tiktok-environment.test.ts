import { validateServerEnvironment } from '../src/config/env';

describe('validación de entorno TikTok', () => {
  const managedKeys = [
    'NODE_ENV',
    'MONGO_URI',
    'JWT_SECRET',
    'CORS_ORIGIN',
    'AI_MODE',
    'TIKTOK_API_APPROVED',
    'TIKTOK_INGESTION_ENABLED',
    'TIKTOK_MESSAGING_ENABLED',
    'TIKTOK_CLIENT_KEY',
    'TIKTOK_CLIENT_SECRET',
    'TIKTOK_OAUTH_REDIRECT_URI',
    'TIKTOK_OAUTH_STATE_SECRET',
    'TIKTOK_TOKEN_ENCRYPTION_KEY',
  ] as const;
  const original = Object.fromEntries(managedKeys.map(key => [key, process.env[key]]));

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.MONGO_URI = 'mongodb://127.0.0.1:27017/test';
    process.env.JWT_SECRET = 'jwt-secret-with-at-least-32-characters';
    process.env.CORS_ORIGIN = 'https://app.example.com';
    process.env.AI_MODE = 'mock';
    process.env.TIKTOK_API_APPROVED = 'false';
    process.env.TIKTOK_INGESTION_ENABLED = 'false';
    process.env.TIKTOK_MESSAGING_ENABLED = 'false';
    process.env.TIKTOK_OAUTH_REDIRECT_URI =
      'https://alma-backend-9eo1.onrender.com/api/v1/tiktok/oauth/callback';
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
    delete process.env.TIKTOK_OAUTH_STATE_SECRET;
    delete process.env.TIKTOK_TOKEN_ENCRYPTION_KEY;
  });

  afterAll(() => {
    for (const key of managedKeys) {
      const value = original[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('permite iniciar sin secretos OAuth cuando TikTok está deshabilitado', () => {
    expect(() => validateServerEnvironment()).not.toThrow();
  });

  it('exige secretos OAuth cuando TikTok está aprobado y habilitado', () => {
    process.env.TIKTOK_API_APPROVED = 'true';
    expect(() => validateServerEnvironment()).toThrow(
      /Faltan variables para OAuth TikTok:.*TIKTOK_CLIENT_KEY/
    );
  });

  it('rechaza capacidades activas sin aprobación oficial', () => {
    process.env.TIKTOK_INGESTION_ENABLED = 'true';
    expect(() => validateServerEnvironment()).toThrow(
      'TIKTOK_API_APPROVED debe ser true antes de habilitar ingesta o mensajería TikTok'
    );
  });
});
