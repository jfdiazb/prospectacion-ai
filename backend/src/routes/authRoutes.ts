import express from 'express';
import { AuthController } from '../controllers/AuthController';
import { authMiddleware } from '../middlewares/auth';
import { loginLimiter } from '../middlewares/rateLimiter';

const router = express.Router();

/**
 * Rutas pÃºblicas
 */
router.post('/register', AuthController.register);
router.post('/login', loginLimiter, AuthController.login);

/**
 * Rutas protegidas
 */
router.get('/profile', authMiddleware, AuthController.getProfile);
router.put('/profile', authMiddleware, AuthController.updateProfile);
router.post('/change-password', authMiddleware, AuthController.changePassword);

export default router;

