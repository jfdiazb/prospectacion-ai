import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { ScraperModeProvider, useScraperMode } from '@context/ScraperModeContext';

vi.mock('@context/AuthContext', () => ({
  useAuth: () => ({ user: { fullName: 'Operador' }, logout: vi.fn() }),
}));

vi.mock('@services/crmService', () => ({
  crmService: { tasks: vi.fn().mockResolvedValue([]) },
}));

const ModeControls = () => {
  const { confirmMode } = useScraperMode();
  return (
    <>
      <button onClick={() => confirmMode('live')}>confirm-live</button>
      <button onClick={() => confirmMode('demo')}>confirm-demo</button>
      <button onClick={() => confirmMode(undefined)}>clear-mode</button>
    </>
  );
};

describe('Social Scraper navigation mode', () => {
  test('shows unknown until the backend mode is confirmed, then reflects LIVE and DEMO', async () => {
    render(
      <MemoryRouter>
        <ScraperModeProvider>
          <Sidebar />
          <Navbar />
          <ModeControls />
        </ScraperModeProvider>
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Social Scraper (estado desconocido)')).toHaveLength(2);

    fireEvent.click(screen.getByText('confirm-live'));
    expect(screen.getAllByText('Social Scraper (LIVE)')).toHaveLength(2);

    fireEvent.click(screen.getByText('confirm-demo'));
    expect(screen.getAllByText('Social Scraper (DEMO)')).toHaveLength(2);

    fireEvent.click(screen.getByText('clear-mode'));
    expect(screen.getAllByText('Social Scraper (estado desconocido)')).toHaveLength(2);
    await waitFor(() => expect(screen.queryByText('Social Scraper (demo)')).not.toBeInTheDocument());
  });
});
