import { apiClient } from './api';
import type { IUser, IAuthResponse, IApiResponse } from '@types';

/**
 * Servicio de Autenticación
 */
export const authService = {
  async register(email: string, password: string, fullName: string): Promise<IAuthResponse> {
    const { data } = await apiClient.post('/auth/register', {
      email,
      password,
      fullName,
    });
    return data.data!;
  },

  async login(email: string, password: string): Promise<IAuthResponse> {
    const { data } = await apiClient.post('/auth/login', {
      email,
      password,
    });
    return data.data!;
  },

  async getProfile(): Promise<IUser> {
    const { data } = await apiClient.get<IApiResponse<IUser>>('/auth/profile');
    return data.data!;
  },

  async updateProfile(userData: Partial<IUser>): Promise<IUser> {
    const { data } = await apiClient.put<IApiResponse<IUser>>('/auth/profile', userData);
    return data.data!;
  },

  async changePassword(oldPassword: string, newPassword: string): Promise<void> {
    await apiClient.post('/auth/change-password', {
      oldPassword,
      newPassword,
    });
  },

  logout(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  },

  getToken(): string | null {
    return localStorage.getItem('token');
  },

  setToken(token: string): void {
    localStorage.setItem('token', token);
  },

  getStoredUser(): IUser | null {
    const stored = localStorage.getItem('user');
    if (!stored) return null;
    try {
      return JSON.parse(stored) as IUser;
    } catch {
      localStorage.removeItem('user');
      return null;
    }
  },

  setStoredUser(user: IUser): void {
    localStorage.setItem('user', JSON.stringify(user));
  },

  isAuthenticated(): boolean {
    return !!this.getToken();
  },
};
