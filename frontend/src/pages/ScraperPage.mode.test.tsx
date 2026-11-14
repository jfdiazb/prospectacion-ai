import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ScraperPage } from './ScraperPage';
import { scraperService } from '@services/scraperService';
import { ScraperModeBootstrap, ScraperModeProvider, useScraperMode } from '@context/ScraperModeContext';

vi.mock('@components/AppLayout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@services/scraperService', () => ({
  scraperService: { scrapeHashtag: vi.fn(), status: vi.fn() },
}));

const ModeObserver = () => {
  const { mode } = useScraperMode();
  return <output data-testid="mode">{mode}</output>;
};

const responseFor = (mode?: 'live' | 'demo') => ({
  success: true,
  message: 'ok',
  data: {
    hashtag: 'ventas',
    totalPosts: 0,
    avgEngagement: 0,
    topPosts: [],
    mode,
  },
});

describe('ScraperPage backend mode confirmation', () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(['live', 'demo'] as const)('shares confirmed %s mode without an extra request', async mode => {
    vi.mocked(scraperService.scrapeHashtag).mockResolvedValue(responseFor(mode));
    render(
      <ScraperModeProvider>
        <ModeObserver />
        <ScraperPage />
      </ScraperModeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Analizar hashtag' }));

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent(mode));
    expect(scraperService.scrapeHashtag).toHaveBeenCalledTimes(1);
    expect(scraperService.scrapeHashtag).toHaveBeenCalledWith('ventas');
  });

  test('keeps the mode unknown when the backend does not confirm it', async () => {
    vi.mocked(scraperService.scrapeHashtag).mockResolvedValue(responseFor());
    render(
      <ScraperModeProvider>
        <ModeObserver />
        <ScraperPage />
      </ScraperModeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Analizar hashtag' }));

    await waitFor(() => expect(scraperService.scrapeHashtag).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('mode')).toHaveTextContent('unknown');
  });

  test('uses the bootstrapped live status before the first search instead of labeling production as demo', async () => {
    vi.mocked(scraperService.status).mockResolvedValue({
      success: true,
      message: 'ok',
      data: { mode: 'live' },
    });
    render(
      <ScraperModeProvider>
        <ScraperModeBootstrap enabled />
        <ScraperPage />
      </ScraperModeProvider>,
    );

    expect(await screen.findByText('Fuente real habilitada: las consultas provienen de YouTube Data API v3.')).toBeInTheDocument();
    expect(screen.queryByText(/Modo demostración/)).not.toBeInTheDocument();
  });

  test('shows unavailable instead of zero when YouTube omits the denominator', async () => {
    vi.mocked(scraperService.scrapeHashtag).mockResolvedValue({
      success: true,
      message: 'ok',
      data: {
        hashtag: 'ventas',
        totalPosts: 1,
        avgEngagement: 0,
        mode: 'live',
        source: 'youtube-data-api-v3',
        topPosts: [{ id: 'video-1', text: 'Video', engagement: 0 }],
      },
    });
    render(
      <ScraperModeProvider>
        <ScraperPage />
      </ScraperModeProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Analizar hashtag' }));

    await waitFor(() => expect(scraperService.scrapeHashtag).toHaveBeenCalledTimes(1));
    expect(screen.getAllByText(/Engagement:?.*No disponible/)).toHaveLength(2);
  });
});
