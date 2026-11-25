import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { prettyDate, weekNumber, weekStart } from '../lib/dates';
import { isDeload, isPullupTest, plannedRunKm } from '../lib/plan/generator';
import { pullupStep } from '../lib/plan/strength';
import { Page } from '../components/ui';

export default function Plan() {
  const s = useSettings();
  const d = useToday();
  const current = weekNumber(d, s.week1Start);
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const maxKm = Math.max(1, ...Array.from({ length: s.raceWeek - s.restartWeek + 1 }, (_, i) => plannedRunKm(sessions.filter((x) => x.week === s.restartWeek + i))));

  return (
    <Page title="Plan" back>
      {s.phases.map((p) => (
        <section key={p.key} className="card">
          <h2 className="text-lg font-bold">
            {p.name} <span className="text-soft text-sm font-semibold">V{p.fromWeek}–{p.toWeek}</span>
          </h2>
          <p className="text-soft mb-2 text-sm">{p.focus}</p>
          <ol className="space-y-1">
            {Array.from({ length: p.toWeek - p.fromWeek + 1 }, (_, i) => p.fromWeek + i).map((w) => {
              const ws = sessions.filter((x) => x.week === w);
              const km = plannedRunKm(ws);
              const long = ws.find((x) => x.kind === 'long' || x.kind === 'race');
              const done = ws.filter((x) => x.status === 'done').length;
              const total = ws.filter((x) => x.kind !== 'rest').length;
              return (
                <li key={w}>
                  <Link to={`/vecka/${w}`} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 ${w === current ? 'bg-surface-2 ring-2 ring-pink' : ''}`}>
                    <span className="w-10 font-bold">V{w}</span>
                    <span className="flex-1">
                      <span className="block text-sm">
                        {prettyDate(weekStart(w, s.week1Start))}
                        {isDeload(s, w) && ' · 💆‍♀️ avlastning'}
                        {isPullupTest(s, w) && ' · 🧗‍♀️ test'}
                      </span>
                      <span className="mt-0.5 block h-2 rounded-full bg-surface-2">
                        <span className="grad block h-2 rounded-full" style={{ width: `${(km / maxKm) * 100}%` }} />
                      </span>
                    </span>
                    <span className="w-24 text-right text-sm">
                      {long?.kind === 'race' ? <b>🏁 LOPP</b> : long?.run ? `${long.run.distanceText} lång` : ''}
                      <span className="text-soft block text-xs">
                        {km} km · {done}/{total}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
      <p className="text-soft text-center text-sm">Pull-up-steg just nu: {pullupStep(Math.max(current, 6))} av 4</p>
    </Page>
  );
}
