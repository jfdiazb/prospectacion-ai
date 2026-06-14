import mongoose, { Schema } from 'mongoose';
import type { IUser } from '../types/index';

/**
 * Schema de Usuario
 */
const userSchema = new Schema(
  {
    email: {
      type: String,
      required: [true, 'Email es requerido'],
      unique: true,
      lowercase: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email invÃ¡lido'],
    },
    password: {
      type: String,
      required: [true, 'ContraseÃ±a es requerida'],
      minlength: 6,
      select: false,
    },
    fullName: {
      type: String,
      required: [true, 'Nombre completo es requerido'],
    },
    avatar: String,
    role: {
      type: String,
      enum: ['admin', 'user', 'team_lead'],
      default: 'user',
    },
    phone: String,
    company: String,
    plan: {
      type: String,
      enum: ['free', 'starter', 'professional', 'enterprise'],
      default: 'free',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: Date,
    settings: {
      notifications: { type: Boolean, default: true },
      emailNotifications: { type: Boolean, default: true },
      darkMode: { type: Boolean, default: true },
    },
  },
  { timestamps: true }
);

/**
 * Indices
 */
userSchema.index({ email: 1 });
userSchema.index({ createdAt: -1 });

export default mongoose.model<IUser & mongoose.Document>('User', userSchema);

