import rateLimit from 'express-rate-limit';

/**
 * Rate limiter general
 */
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite de 100 requests por ventana
  message: 'Demasiadas solicitudes, intente más tarde',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter para login
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // máximo 5 intentos
  message: 'Demasiados intentos de login, intente en 15 minutos',
  skipSuccessfulRequests: true,
});

/**
 * Rate limiter para API
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30,
  message: 'Demasiadas solicitudes a la API',
});
