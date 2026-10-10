import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { scraperService } from '@services/scraperService';

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
  const confirmMode = useCallback((candidate: string | undefined) => {
    setMode(candidate === 'live' || candidate === 'demo' ? candidate : 'unknown');
  }, []);
  const value = useMemo<ScraperModeContextValue>(() => ({
    mode,
    confirmMode,
  }), [confirmMode, mode]);

  return <ScraperModeContext.Provider value={value}>{children}</ScraperModeContext.Provider>;
};

export const ScraperModeBootstrap = ({ enabled }: { enabled: boolean }) => {
  const { confirmMode } = useScraperMode();

  useEffect(() => {
    let active = true;
    if (!enabled) {
      confirmMode(undefined);
      return () => { active = false; };
    }
    scraperService.status()
      .then(response => {
        if (active) confirmMode(response.data?.mode);
      })
      .catch(() => {
        if (active) confirmMode(undefined);
      });
    return () => { active = false; };
  }, [confirmMode, enabled]);

  return null;
};

export const useScraperMode = (): ScraperModeContextValue => {
  return useContext(ScraperModeContext);
};
