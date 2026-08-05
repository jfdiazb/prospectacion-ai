import dotenv from 'dotenv';
import path from 'path';

dotenv.config();
dotenv.config({ path: path.resolve(process.cwd(), '../.env'), override: false });

export const validateServerEnvironment = (): void => {
  const required = ['MONGO_URI', 'JWT_SECRET'];
  if (process.env.NODE_ENV === 'production') required.push('CORS_ORIGIN');
  const missing = required.filter(key => !process.env[key]?.trim());
  if (missing.length) throw new Error(`Faltan variables obligatorias: ${missing.join(', ')}`);
  if (process.env.NODE_ENV === 'production' && (process.env.JWT_SECRET?.length ?? 0) < 32) {
    throw new Error('JWT_SECRET debe tener al menos 32 caracteres en producción');
  }
};
