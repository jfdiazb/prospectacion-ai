import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { IUser } from '../types/index';
import { authService } from '../services/authService';

interface AuthContextType {
  user: IUser | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  logout: () => void;
  updateProfile: (userData: Partial<IUser>) => Promise<IUser>;
  changePassword: (oldPassword: string, newPassword: string) => Promise<void>;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<IUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Cargar usuario al montar
useEffect(() => {
  const loadUser = async () => {
    const token = authService.getToken();

    if (!token) {
      authService.logout();
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const userData = await authService.getProfile();
      setUser(userData);
      authService.setStoredUser(userData);
    } catch (error) {
      authService.logout();
      setUser(null);
    }

    setIsLoading(false);
  };

  loadUser();
}, []);

  const login = async (email: string, password: string) => {
    const { token, user: userData } = await authService.login(email, password);
    authService.setToken(token);
    authService.setStoredUser(userData);
    setUser(userData);
  };

  const register = async (email: string, password: string, fullName: string) => {
    const { token, user: userData } = await authService.register(email, password, fullName);
    authService.setToken(token);
    authService.setStoredUser(userData);
    setUser(userData);
  };

  const updateProfile = async (userData: Partial<IUser>) => {
    const updatedUser = await authService.updateProfile(userData);
    setUser(updatedUser);
    return updatedUser;
  };

  const changePassword = async (oldPassword: string, newPassword: string) => {
    await authService.changePassword(oldPassword, newPassword);
  };

  const logout = () => {
    authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        register,
        logout,
        updateProfile,
        changePassword,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
