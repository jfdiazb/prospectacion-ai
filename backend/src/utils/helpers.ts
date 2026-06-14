import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Hash de contraseña
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(10);
  return await bcrypt.hash(password, salt);
};

/**
 * Comparar contraseña
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

/**
 * Generar JWT
 */
export const generateToken = (payload: any, expiresIn = '24h'): string => {
  const secret = process.env.JWT_SECRET || 'secret';
  return jwt.sign(payload, secret, { expiresIn } as any);
};

/**
 * Verificar JWT
 */
export const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'secret');
  } catch (error) {
    throw new Error('Token inválido o expirado');
  }
};

/**
 * Decodificar JWT sin verificar
 */
export const decodeToken = (token: string): any => {
  return jwt.decode(token);
};

/**
 * Generar ID único
 */
export const generateId = (): string => {
  return new Date().getTime().toString(36) + Math.random().toString(36).substr(2);
};

/**
 * Validar email
 */
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Sanitizar string
 */
export const sanitizeString = (str: string): string => {
  return str
    .replace(/[<>]/g, '')
    .trim()
    .substring(0, 1000);
};

/**
 * Calcular score de lead
 */
export const calculateLeadScore = (data: {
  followers?: number;
  engagement?: number;
  bio?: string;
  recentActivity?: number;
}): number => {
  let score = 0;

  // Followers (0-30 points)
  if (data.followers) {
    score += Math.min(30, (data.followers / 10000) * 30);
  }

  // Engagement (0-40 points)
  if (data.engagement) {
    score += Math.min(40, data.engagement * 40);
  }

  // Bio keywords (0-20 points)
  if (data.bio) {
    const keywords = [
      'emprendedor',
      'negocio',
      'marketing',
      'network',
      'ingresos',
      'motivación',
      'desarrollo',
      'fitness',
    ];
    const bioLower = data.bio.toLowerCase();
    const keywordCount = keywords.filter(k => bioLower.includes(k)).length;
    score += Math.min(20, keywordCount * 5);
  }

  // Recent activity (0-10 points)
  if (data.recentActivity) {
    score += Math.min(10, data.recentActivity);
  }

  return Math.round(Math.min(100, Math.max(0, score)));
};

/**
 * Paginar array
 */
export const paginate = <T>(
  array: T[],
  page: number = 1,
  limit: number = 10
): { data: T[]; total: number; page: number; pages: number } => {
  const skip = (page - 1) * limit;
  const data = array.slice(skip, skip + limit);
  const pages = Math.ceil(array.length / limit);

  return { data, total: array.length, page, pages };
};

/**
 * Formatear fecha
 */
export const formatDate = (date: Date): string => {
  return new Date(date).toLocaleDateString('es-ES', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
};

/**
 * Esperar en milisegundos
 */
export const delay = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

/**
 * Obtener próxima fecha de seguimiento
 */
export const getNextFollowUpDate = (daysFromNow: number = 1): Date => {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  return date;
};
