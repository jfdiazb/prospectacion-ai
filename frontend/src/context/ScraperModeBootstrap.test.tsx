import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { scraperService } from '@services/scraperService';
import { ScraperModeBootstrap, ScraperModeProvider, useScraperMode } from './ScraperModeContext';

vi.mock('@services/scraperService', () => ({
  scraperService: { status: vi.fn() },
}));

const ModeObserver = () => {
  const { mode } = useScraperMode();
  return <output data-testid="mode">{mode}</output>;
};

describe('ScraperModeBootstrap', () => {
  beforeEach(() => vi.clearAllMocks());

  test.each(['live', 'demo'] as const)('loads confirmed %s mode without a scraper search', async mode => {
    vi.mocked(scraperService.status).mockResolvedValue({
      success: true,
      message: 'ok',
      data: { mode },
    });

    render(
      <ScraperModeProvider>
        <ScraperModeBootstrap enabled />
        <ModeObserver />
      </ScraperModeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('mode')).toHaveTextContent(mode));
    expect(scraperService.status).toHaveBeenCalledTimes(1);
  });

  test('keeps unknown when status cannot be confirmed', async () => {
    vi.mocked(scraperService.status).mockRejectedValue(new Error('unavailable'));

    render(
      <ScraperModeProvider>
        <ScraperModeBootstrap enabled />
        <ModeObserver />
      </ScraperModeProvider>,
    );

    await waitFor(() => expect(scraperService.status).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('mode')).toHaveTextContent('unknown');
  });
});
