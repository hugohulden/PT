import { useEffect, useState } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './db/db';
import { ensureInitialized } from './db/repo';
import { useSettings, useTheme } from './hooks';
import Today from './pages/Today';
import Week from './pages/Week';
import Log from './pages/Log';
import Workout from './pages/Workout';
import More from './pages/More';
import Plan from './pages/Plan';
import SettingsPage from './pages/Settings';
import Progress from './pages/Progress';
import Placeholder from './pages/Placeholder';
import Garmin from './pages/Garmin';
import Sync from './pages/Sync';
import Import from './pages/Import';
import PullUp from './pages/PullUp';
import Weight from './pages/Weight';
import Health from './pages/Health';
import Badges from './pages/Badges';
import { startAutoSync } from './sync/cloud';
import { startIntervalsAutoSync } from './sync/intervals';
import { registerCustomExercises } from './lib/exercises';
import { evaluateBadges } from './lib/badges';
import { matchActivities } from './lib/importer';
import { celebrate } from './lib/fx';
import { Toast } from './components/ui';
import InstallGuide from './components/InstallGuide';

const TABS = [
  { to: '/', label: 'Idag', icon: '🌸', end: true },
  { to: '/vecka', label: 'Vecka', icon: '📅' },
  { to: '/logga', label: 'Logga', icon: '💪' },
  { to: '/framsteg', label: 'Framsteg', icon: '📈' },
  { to: '/mer', label: 'Mer', icon: '✨' },
];

export default function App() {
  const [ready, setReady] = useState(false);
  const [badgeToast, setBadgeToast] = useState<string | null>(null);
  const settings = useSettings();
  useTheme(settings.theme);
  const active = useLiveQuery(() => db.workoutLogs.where('status').equals('active').count(), []);

  // Egna övningar (synkas mellan enheter) görs kända för resten av appen
  const customs = useLiveQuery(() => db.customExercises.toArray(), []);
  useEffect(() => {
    if (customs) registerCustomExercises(customs);
  }, [customs]);

  // Nya märken: kolla när data ändras (loggade set, synkad Garmin-data, avslutade pass)
  const dataStamp = useLiveQuery(async () => `${await db.setLogs.count()}|${await db.activities.count()}|${await db.health.count()}|${await db.workoutLogs.where('status').equals('done').count()}|${await db.prs.count()}`, []);
  useEffect(() => {
    if (!ready || !dataStamp) return;
    void evaluateBadges().then((nb) => {
      if (!nb.length) return;
      celebrate(nb.some((b) => b.id === 'pu-first') ? 'milestone' : nb.some((b) => b.group === 'vecka' || b.id === 'run-calm-week') ? 'hearts' : 'pr');
      setBadgeToast(`Nytt märke: ${nb.map((b) => `${b.icon} ${b.name}`).join(', ')}!`);
    });
  }, [ready, dataStamp]);

  useEffect(() => {
    ensureInitialized()
      .then(() => matchActivities())
      .then(() => {
        setReady(true);
        startAutoSync();
        startIntervalsAutoSync();
      });
    // Be iOS att inte rensa lagringen
    void navigator.storage?.persist?.();
  }, []);

  if (!ready) {
    return (
      <div className="grad flex min-h-screen items-center justify-center">
        <span className="font-display text-3xl font-bold text-white">💖</span>
      </div>
    );
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/vecka" element={<Week />} />
        <Route path="/vecka/:week" element={<Week />} />
        <Route path="/logga" element={<Log />} />
        <Route path="/logga/:id" element={<Workout />} />
        <Route path="/framsteg" element={<Progress />} />
        <Route path="/mer" element={<More />} />
        <Route path="/plan" element={<Plan />} />
        <Route path="/installningar" element={<SettingsPage />} />
        <Route path="/garmin" element={<Garmin />} />
        <Route path="/synk" element={<Sync />} />
        <Route path="/import" element={<Import />} />
        <Route path="/pullup" element={<PullUp />} />
        <Route path="/vikt" element={<Weight />} />
        <Route path="/halsa" element={<Health />} />
        <Route path="/marken" element={<Badges />} />
        <Route path="*" element={<Placeholder />} />
      </Routes>
      {import.meta.env.VITE_PREVIEW !== '1' && <InstallGuide />}
      <Toast msg={badgeToast} onDone={() => setBadgeToast(null)} />
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-line backdrop-blur-xl safe-bottom"
        style={{ background: 'color-mix(in srgb, var(--surface) 88%, transparent)' }}
        aria-label="Huvudmeny"
      >
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                `relative flex min-h-[56px] flex-1 flex-col items-center justify-center text-xs font-semibold ${isActive ? 'text-accent' : 'text-soft'}`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`text-xl transition-transform ${isActive ? 'scale-110' : 'opacity-70 grayscale-[40%]'}`} aria-hidden>
                    {t.icon}
                  </span>
                  {t.label}
                  {t.to === '/logga' && !!active && <span className="absolute right-[30%] top-2 h-2.5 w-2.5 rounded-full bg-pink" aria-label="Pass pågår" />}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
