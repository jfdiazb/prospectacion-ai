import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from './SettingsPage';

let role = 'admin';
vi.mock('@context/AuthContext', () => ({ useAuth: () => ({ user: { role, fullName: 'Admin', email: 'admin@example.test' }, logout: vi.fn() }) }));
vi.mock('@components/AppLayout', () => ({ AppLayout: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('@services/youtubeService', () => ({ youtubeService: { getStatus: vi.fn().mockResolvedValue({ connected: false }), getDiagnostics: vi.fn().mockResolvedValue(null) } }));
vi.mock('@services/commercialContextService', () => ({ commercialContextService: { active: vi.fn().mockResolvedValue(null) } }));
vi.mock('@components/settings/WhatsAppLiveDiagnostics', () => ({ WhatsAppLiveDiagnostics: () => <div>Diagnóstico WhatsApp LIVE</div> }));
vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));

describe('SettingsPage WhatsApp diagnostics visibility', () => {
  beforeEach(() => { role = 'admin'; });

  it('muestra el diagnóstico al administrador autenticado', () => {
    render(<SettingsPage />);
    expect(screen.getByText('Diagnóstico WhatsApp LIVE')).toBeInTheDocument();
  });

  it('explica por qué el diagnóstico no está habilitado para un usuario no autorizado', () => {
    role = 'user';
    render(<SettingsPage />);
    expect(screen.getByText('Diagnóstico WhatsApp LIVE')).toBeInTheDocument();
    expect(screen.getByText(/este diagnóstico requiere autorización administrativa/i)).toBeInTheDocument();
  });
});
