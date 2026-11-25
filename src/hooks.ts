import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db } from './db/db';
import { DEFAULT_SETTINGS } from './lib/settings';
import { today, weekNumber } from './lib/dates';
import type { Settings } from './lib/types';

export function useSettings(): Settings {
  const s = useLiveQuery(() => db.settings.get('main'), []);
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
}

/** Dagens datum som uppdateras vid midnatt och när appen öppnas igen. */
export function useToday() {
  const [d, setD] = useState(today());
  useEffect(() => {
    const tick = () => setD(today());
    const id = setInterval(tick, 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);
  return d;
}

export function useCurrentWeek() {
  const s = useSettings();
  const d = useToday();
  return weekNumber(d, s.week1Start);
}

export function useTheme(theme: Settings['theme']) {
  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
    } catch {
      /* privat läge */
    }
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && mq.matches);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [theme]);
}
