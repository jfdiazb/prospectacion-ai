import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { authService } from '@services/authService';
import { AuthProvider } from '@context/AuthContext';
import { ProfilePage } from './ProfilePage';

vi.mock('@services/authService', () => ({
  authService: {
    register: vi.fn(),
    login: vi.fn(),
    getProfile: vi.fn().mockResolvedValue({ email: 'me@example.com', fullName: 'Me User', role: 'user', avatar: '' }),
    updateProfile: vi.fn().mockResolvedValue({ email: 'me@example.com', fullName: 'Updated Name', role: 'user', avatar: 'https://avatar' }),
    changePassword: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn(),
    getToken: vi.fn().mockReturnValue('fake-token'),
    setToken: vi.fn(),
    getStoredUser: vi.fn().mockReturnValue({ email: 'me@example.com', fullName: 'Me User', role: 'user', avatar: '' }),
    setStoredUser: vi.fn(),
    isAuthenticated: vi.fn().mockReturnValue(true),
    __esModule: true,
  },
}));

describe('ProfilePage', () => {
  it('updates profile when saving changes', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const nameInput = await screen.findByDisplayValue('Me User');
    const avatarInput = screen.getByPlaceholderText('https://...');
    const saveButton = screen.getByRole('button', { name: /guardar cambios/i });

    const user = userEvent.setup();
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated Name');
    await waitFor(() => expect((nameInput as HTMLInputElement).value).toMatch(/Updated Name/));
    await user.type(avatarInput, 'https://avatar');
    await userEvent.click(saveButton);

    expect(authService.updateProfile).toHaveBeenCalled();
    const calledWith = (authService.updateProfile as any).mock.calls[0][0];
    expect(calledWith.avatar).toBe('https://avatar');
    expect(calledWith.fullName).toMatch(/Updated Name/);
  });

  it('changes password when submitted', async () => {
    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const oldPass = screen.getByPlaceholderText('Contraseña actual');
    const newPass = screen.getByPlaceholderText('Nueva contraseña');
    const updateButton = screen.getByRole('button', { name: /actualizar contraseña/i });

    await userEvent.type(oldPass, 'oldpass1');
    await userEvent.type(newPass, 'newpass2');
    await userEvent.click(updateButton);

    expect(authService.changePassword).toHaveBeenCalledWith('oldpass1', 'newpass2');
  });

  it('shows an error when profile update fails', async () => {
    (authService.updateProfile as any).mockRejectedValueOnce({ response: { data: { message: 'Error al actualizar perfil' } } });

    render(
      <MemoryRouter>
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>
      </MemoryRouter>,
    );

    const nameInput = await screen.findByDisplayValue('Me User');
    const saveButton = screen.getByRole('button', { name: /guardar cambios/i });

    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Updated Name');
    await userEvent.click(saveButton);

    await waitFor(() => expect(screen.getByText(/Error al actualizar perfil/i)).toBeInTheDocument());
  });
});
