import type { Request, Response, NextFunction } from 'express';
import { verifyToken } from '../utils/helpers';
import { MESSAGES, HTTP_STATUS } from '../config/constants';

/**
 * Interface extendida de Request con usuario
 */
export interface AuthRequest extends Request {
  user?: any;
  userId?: string;
}

/**
 * Middleware de autenticaciÃ³n JWT
 */
export const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  try {
    const authorization = req.headers.authorization;
    const token = authorization?.startsWith('Bearer ') ? authorization.slice(7) : undefined;

    if (!token) {
      res.status(HTTP_STATUS.UNAUTHORIZED).json({
        success: false,
        message: MESSAGES.ERROR.UNAUTHORIZED,
      });
      return;
    }

    const decoded = verifyToken(token);
    req.user = decoded;
    req.userId = decoded.id;
    next();
  } catch (error) {
    res.status(HTTP_STATUS.UNAUTHORIZED).json({
      success: false,
      message: MESSAGES.ERROR.UNAUTHORIZED,
    });
  }
};

/**
 * Middleware para verificar rol
 */
export const roleMiddleware = (allowedRoles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        message: MESSAGES.ERROR.FORBIDDEN,
      });
      return;
    }
    next();
  };
};

/**
 * Middleware de ownership (verificar que el recurso pertenece al usuario)
 */
export const ownershipMiddleware = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const userId = req.params.userId || req.body.userId;

  if (!req.user || req.user.id !== userId) {
    res.status(HTTP_STATUS.FORBIDDEN).json({
      success: false,
      message: MESSAGES.ERROR.FORBIDDEN,
    });
    return;
  }
  next();
};

/**
 * Middleware de error
 */
export const errorMiddleware = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.error('Error de aplicación', { message: err.message, path: req.path });

  const status = err.status || HTTP_STATUS.INTERNAL_ERROR;
  const message = err.message || MESSAGES.ERROR.SERVER_ERROR;

  res.status(status).json({
    success: false,
    message,
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

/**
 * Middleware 404
 */
export const notFoundMiddleware = (req: Request, res: Response): void => {
  res.status(HTTP_STATUS.NOT_FOUND).json({
    success: false,
    message: MESSAGES.ERROR.NOT_FOUND,
  });
};

