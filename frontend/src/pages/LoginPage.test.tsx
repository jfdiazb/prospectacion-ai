import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { authService } from '@services/authService';
import { AuthProvider } from '@context/AuthContext';
import { LoginPage } from './LoginPage';

vi.mock('@services/authService', () => ({
  authService: {
    login: vi.fn().mockResolvedValue({
      token: 'fake-token',
      user: { email: 'test@example.com', fullName: 'Test User', role: 'user' },
    }),
    register: vi.fn(),
    getProfile: vi.fn(),
    updateProfile: vi.fn(),
    changePassword: vi.fn(),
    logout: vi.fn(),
    getToken: vi.fn().mockReturnValue(null),
    setToken: vi.fn(),
    getStoredUser: vi.fn().mockReturnValue(null),
    setStoredUser: vi.fn(),
    isAuthenticated: vi.fn().mockReturnValue(false),
    __esModule: true,
  },
}));

describe('LoginPage', () => {
  it('renders login form and submits credentials', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const emailInput = screen.getByPlaceholderText('tu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    await userEvent.type(emailInput, 'test@example.com');
    await userEvent.type(passwordInput, 'password123');
    await userEvent.click(submitButton);

    expect(authService.login).toHaveBeenCalledWith('test@example.com', 'password123');
    expect(authService.login).toHaveBeenCalledTimes(1);
  });

  it('displays an error when login fails', async () => {
    (authService.login as any).mockRejectedValueOnce({ response: { data: { message: 'Credenciales inválidas' } } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const emailInput = screen.getByPlaceholderText('tu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /iniciar sesión/i });

    await userEvent.type(emailInput, 'wrong@example.com');
    await userEvent.type(passwordInput, 'wrongpass');
    await userEvent.click(submitButton);

    await waitFor(() => expect(screen.getByText(/Credenciales inválidas/i)).toBeInTheDocument());
  });
});
