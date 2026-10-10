import { createContext, ReactNode, useContext, useMemo, useState } from 'react';

export type ConfirmedScraperMode = 'live' | 'demo';
export type ScraperModeStatus = ConfirmedScraperMode | 'unknown';

interface ScraperModeContextValue {
  mode: ScraperModeStatus;
  confirmMode: (mode: string | undefined) => void;
}

const unknownScraperMode: ScraperModeContextValue = {
  mode: 'unknown',
  confirmMode: () => undefined,
};

const ScraperModeContext = createContext<ScraperModeContextValue>(unknownScraperMode);

export const scraperModeLabel = (mode: ScraperModeStatus): string => {
  if (mode === 'live') return 'Social Scraper (LIVE)';
  if (mode === 'demo') return 'Social Scraper (DEMO)';
  return 'Social Scraper (estado desconocido)';
};

export const ScraperModeProvider = ({ children }: { children: ReactNode }) => {
  const [mode, setMode] = useState<ScraperModeStatus>('unknown');
  const value = useMemo<ScraperModeContextValue>(() => ({
    mode,
    confirmMode: candidate => setMode(candidate === 'live' || candidate === 'demo' ? candidate : 'unknown'),
  }), [mode]);

  return <ScraperModeContext.Provider value={value}>{children}</ScraperModeContext.Provider>;
};

export const useScraperMode = (): ScraperModeContextValue => {
  return useContext(ScraperModeContext);
};
