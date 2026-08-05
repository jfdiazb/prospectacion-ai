import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { authService } from '@services/authService';
import { AuthProvider } from '@context/AuthContext';
import { RegisterPage } from './RegisterPage';

vi.mock('@services/authService', () => ({
  authService: {
    register: vi.fn().mockResolvedValue({
      token: 'fake-token',
      user: { email: 'new@example.com', fullName: 'New User', role: 'user' },
    }),
    login: vi.fn(),
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

describe('RegisterPage', () => {
  it('renders register form and submits credentials', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <RegisterPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const nameInput = screen.getByPlaceholderText('Tu nombre completo');
    const emailInput = screen.getByPlaceholderText('tu@email.com');
    const passwordInput = screen.getByPlaceholderText('••••••••');
    const submitButton = screen.getByRole('button', { name: /crear cuenta/i });

    await userEvent.type(nameInput, 'New User');
    await userEvent.type(emailInput, 'new@example.com');
    await userEvent.type(passwordInput, 'newpass123');
    await userEvent.click(submitButton);

    expect(authService.register).toHaveBeenCalledWith('new@example.com', 'newpass123', 'New User');
    expect(authService.register).toHaveBeenCalledTimes(1);
  });
});
