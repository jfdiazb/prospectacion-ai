import User from '../models/User';
import type { IUser, IAuthResponse } from '../types/index';
import { hashPassword, comparePassword, generateToken, validateEmail } from '../utils/helpers';
import { MESSAGES } from '../config/constants';

/**
 * Servicio de AutenticaciÃ³n
 */
export class AuthService {
  /**
   * Registrar nuevo usuario
   */
  static async register(userData: Partial<IUser>): Promise<IAuthResponse> {
    // Validar email
    if (!userData.email || !validateEmail(userData.email)) {
      throw new Error(MESSAGES.ERROR.VALIDATION_ERROR);
    }

    // Verificar si el email ya existe
    const existingUser = await User.findOne({ email: userData.email });
    if (existingUser) {
      throw new Error(MESSAGES.ERROR.EMAIL_ALREADY_EXISTS);
    }

    // Validar contraseÃ±a
    if (!userData.password || userData.password.length < 6) {
      throw new Error(MESSAGES.ERROR.WEAK_PASSWORD);
    }

    // Hash de la contraseÃ±a
    const hashedPassword = await hashPassword(userData.password);

    // Crear usuario
    const user = await User.create({
      email: userData.email,
      password: hashedPassword,
      fullName: userData.fullName,
      role: userData.role || 'user',
    });

    // Generar token
    const token = generateToken({ id: user._id, email: user.email });

    return {
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }

  /**
   * Iniciar sesiÃ³n
   */
  static async login(email: string, password: string): Promise<IAuthResponse> {
    // Buscar usuario
    const user = (await User.findOne({ email }).select('+password')) as any;

    if (!user) {
      throw new Error(MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    // Verificar contraseÃ±a
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
      throw new Error(MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    // Actualizar Ãºltimo login
    user.lastLogin = new Date();
    await user.save();

    // Generar token
    const token = generateToken({ id: user._id, email: user.email, role: user.role });

    return {
      token,
      user: {
        _id: user._id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        plan: user.plan,
      },
    };
  }

  /**
   * Obtener usuario por ID
   */
  static async getUserById(userId: string): Promise<IUser | null> {
    return await User.findById(userId);
  }

  /**
   * Actualizar perfil de usuario
   */
  static async updateProfile(userId: string, updateData: Partial<IUser>): Promise<IUser | null> {
    const allowedFields = ['fullName', 'avatar', 'phone', 'company'];
    const filteredData = Object.keys(updateData)
      .filter(key => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updateData[key as keyof IUser];
        return obj;
      }, {} as any);

    return await User.findByIdAndUpdate(userId, filteredData, { new: true });
  }

  /**
   * Cambiar contraseÃ±a
   */
  static async changePassword(userId: string, oldPassword: string, newPassword: string): Promise<void> {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new Error(MESSAGES.ERROR.NOT_FOUND);
    }

    const isPasswordValid = await comparePassword(oldPassword, user.password);

    if (!isPasswordValid) {
      throw new Error(MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    if (newPassword.length < 6) {
      throw new Error(MESSAGES.ERROR.WEAK_PASSWORD);
    }

    user.password = await hashPassword(newPassword);
    await user.save();
  }

  /**
   * Verificar si el usuario existe
   */
  static async userExists(email: string): Promise<boolean> {
    const user = await User.findOne({ email });
    return !!user;
  }
}

