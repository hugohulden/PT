import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate } from 'react-router-dom';
import { db } from '../db/db';
import { startWorkout } from '../db/repo';
import { useSettings, useToday } from '../hooks';
import { addDays, dayShort, prettyDate, weekDates, weekNumber } from '../lib/dates';
import type { SessionKind } from '../lib/types';
import { KIND_EMOJI, Page, Sheet, StatusChip } from '../components/ui';

export default function Log() {
  const s = useSettings();
  const d = useToday();
  const nav = useNavigate();
  const week = weekNumber(d, s.week1Start);
  const dates = weekDates(week, s.week1Start);
  const active = useLiveQuery(() => db.workoutLogs.where('status').equals('active').toArray(), []) ?? [];
  const thisWeek =
    useLiveQuery(() => db.sessions.where('date').between(dates[0], dates[6], true, true).filter((x) => x.type === 'strength').toArray(), [dates[0]]) ?? [];
  const recent = useLiveQuery(() => db.workoutLogs.orderBy('date').reverse().filter((w) => w.status === 'done' && !w.deleted).limit(10).toArray(), []) ?? [];
  const [own, setOwn] = useState(false);
  const [ownDate, setOwnDate] = useState(d);

  async function startOwn(kind: SessionKind) {
    const w = await startWorkout(undefined, kind, ownDate);
    const titles: Record<string, string> = { gymA: 'Gym A – Ben & rumpa', gymB: 'Gym B – Rygg & mage', gymExtra: 'Extrapass – Bröst, axlar & triceps' };
    await db.workoutLogs.update(w.id, { title: titles[kind] ?? 'Eget pass', beforeApp: ownDate < '2026-11-23' || undefined });
    nav(`/logga/${w.id}`);
  }

  return (
    <Page title="Logga">
      {active.map((w) => (
        <Link key={w.id} to={`/logga/${w.id}`} className="card grad block text-on-grad">
          <p className="text-sm font-semibold">Pågående pass</p>
          <p className="text-xl font-bold">{w.title}</p>
          <p className="font-semibold">Tryck för att fortsätta →</p>
        </Link>
      ))}

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Gympass den här veckan</h2>
        {thisWeek.length === 0 && <p className="text-soft">Inga gympass planerade.</p>}
        {thisWeek.map((x) => (
          <button
            key={x.id}
            className="flex w-full items-center gap-3 py-2 text-left"
            onClick={async () => {
              const w = await startWorkout(x, x.kind, x.date);
              nav(`/logga/${w.id}`);
            }}
          >
            <span className="text-2xl" aria-hidden>
              {KIND_EMOJI[x.kind]}
            </span>
            <span className="flex-1">
              <span className="block font-semibold">{x.title}</span>
              <span className="text-soft text-sm">
                {dayShort(x.date)} {prettyDate(x.date)}
              </span>
            </span>
            <StatusChip s={x} past={x.date < d} />
          </button>
        ))}
      </section>

      <button className="btn btn-outline w-full" onClick={() => setOwn(true)}>
        + Eget pass eller historiskt datum
      </button>

      <section className="card">
        <h2 className="mb-2 text-lg font-semibold">Senaste passen</h2>
        {recent.length === 0 && <p className="text-soft">Inga loggade pass än – första passet blir startvärdet för vikterna 💪</p>}
        {recent.map((w) => (
          <Link key={w.id} to={`/logga/${w.id}`} className="flex items-center justify-between py-2">
            <span>
              <span className="block font-semibold">{w.title}</span>
              <span className="text-soft text-sm">
                {prettyDate(w.date)}
                {w.beforeApp ? ' · före appen' : ''}
              </span>
            </span>
            <span className="text-soft">›</span>
          </Link>
        ))}
      </section>

      <Sheet open={own} onClose={() => setOwn(false)} title="Eget pass">
        <label className="block">
          <span className="font-semibold">Datum</span>
          <input type="date" className="field mt-1" value={ownDate} max={addDays(d, 7)} onChange={(e) => setOwnDate(e.target.value)} />
        </label>
        <p className="text-soft mt-2 text-sm">Välj ett tidigare datum för att registrera pass du gjort före appen.</p>
        <div className="mt-3 grid gap-2">
          <button className="btn btn-primary" onClick={() => startOwn('gymA')}>
            🍑 Gym A – Ben & rumpa
          </button>
          <button className="btn btn-primary" onClick={() => startOwn('gymB')}>
            💪 Gym B – Rygg & mage
          </button>
          <button className="btn btn-ghost" onClick={() => startOwn('gymExtra')}>
            ✨ Extrapass – Bröst, axlar & triceps
          </button>
        </div>
      </Sheet>
    </Page>
  );
}
