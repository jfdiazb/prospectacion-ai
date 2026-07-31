import User from '../models/User';
import type { IUser, IAuthResponse } from '../types/index';
import {
  hashPassword,
  comparePassword,
  generateToken,
  validateEmail,
} from '../utils/helpers';
import { MESSAGES } from '../config/constants';

/**
 * Servicio de Autenticación
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

    // Validar contraseña
    if (!userData.password || userData.password.length < 6) {
      throw new Error(MESSAGES.ERROR.WEAK_PASSWORD);
    }

    // Hash de la contraseña
    const hashedPassword = await hashPassword(userData.password);

    // Crear usuario
    const user = await User.create({
      email: userData.email,
      password: hashedPassword,
      fullName: userData.fullName,
      role: userData.role || 'user',
    });

    // Generar token
    const token = generateToken({
      id: user._id,
      email: user.email,
    });

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
   * Iniciar sesión
   */
  static async login(email: string, password: string): Promise<IAuthResponse> {
    console.log('\n================ LOGIN =================');
    console.log('📧 Email recibido:', email);

    // Buscar usuario
    const user = await User.findOne({ email }).select('+password');

    console.log('👤 Usuario encontrado:', user ? 'SI' : 'NO');

    if (!user) {
      console.log('❌ No existe un usuario con ese email');
      throw new Error(MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    console.log('🔐 Password almacenada:', user.password);

    // Verificar contraseña
    const isPasswordValid = await comparePassword(password, user.password);

    console.log('🔍 Password válida:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('❌ Contraseña incorrecta');
      throw new Error(MESSAGES.ERROR.INVALID_CREDENTIALS);
    }

    console.log('✅ Credenciales correctas');

    // Actualizar último login
    user.lastLogin = new Date();

    console.log('💾 Guardando último login...');
    await user.save();

    console.log('✅ Último login actualizado');

    // Generar token
    console.log('🎫 Generando JWT...');

    const token = generateToken({
      id: user._id,
      email: user.email,
      role: user.role,
    });

    console.log('✅ JWT generado correctamente');
    console.log('🚀 LOGIN EXITOSO');
    console.log('========================================\n');

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
   * Actualizar perfil
   */
  static async updateProfile(
    userId: string,
    updateData: Partial<IUser>
  ): Promise<IUser | null> {
    const allowedFields = [
      'fullName',
      'avatar',
      'phone',
      'company',
    ];

    const filteredData = Object.keys(updateData)
      .filter((key) => allowedFields.includes(key))
      .reduce((obj, key) => {
        obj[key] = updateData[key as keyof IUser];
        return obj;
      }, {} as any);

    return await User.findByIdAndUpdate(userId, filteredData, {
      new: true,
    });
  }

  /**
   * Cambiar contraseña
   */
  static async changePassword(
    userId: string,
    oldPassword: string,
    newPassword: string
  ): Promise<void> {
    const user = await User.findById(userId).select('+password');

    if (!user) {
      throw new Error(MESSAGES.ERROR.NOT_FOUND);
    }

    const isPasswordValid = await comparePassword(
      oldPassword,
      user.password
    );

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