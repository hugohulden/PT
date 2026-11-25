import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { db } from '../db/db';
import { addExtraSession, moveSession, startWorkout, updateSession } from '../db/repo';
import { useSettings, useToday } from '../hooks';
import { dayShort, prettyDate, weekDates, weekNumber } from '../lib/dates';
import { isDeload, phaseOf, plannedRunKm } from '../lib/plan/generator';
import { scheduleWarnings } from '../lib/rules';
import type { PlannedSession } from '../lib/types';
import SessionDetail from '../components/SessionDetail';
import HistoryCard from '../components/HistoryCard';
import { historyWeek } from '../lib/history';
import { HrBadge, KIND_EMOJI, Page, Sheet, StatusChip } from '../components/ui';

export default function Week() {
  const s = useSettings();
  const d = useToday();
  const nav = useNavigate();
  const params = useParams();
  const current = weekNumber(d, s.week1Start);
  const week = params.week ? Number(params.week) : Math.max(s.restartWeek, Math.min(current, s.raceWeek));
  const dates = weekDates(week, s.week1Start);
  const sessions = useLiveQuery(() => db.sessions.where('date').between(dates[0], dates[6], true, true).toArray(), [dates[0]]) ?? [];
  const [sel, setSel] = useState<PlannedSession | null>(null);
  const [moving, setMoving] = useState<PlannedSession | null>(null);
  const phase = phaseOf(s, week);
  const warnings = scheduleWarnings(sessions);
  const doneCount = sessions.filter((x) => x.status === 'done').length;
  const total = sessions.filter((x) => x.kind !== 'rest').length;
  const dirty = sessions.some((x) => x.garminDirty && x.garminExported);

  const go = (w: number) => nav(`/vecka/${w}`, { replace: true });

  async function open(x: PlannedSession) {
    setSel(x);
  }

  return (
    <Page
      title={
        <span>
          Vecka {week}
          {week === current && <span className="chip ml-2 align-middle">nu</span>}
        </span>
      }
      action={
        <div className="flex gap-1">
          <button className="btn btn-ghost px-3" onClick={() => go(week - 1)} disabled={week <= 1} aria-label="Förra veckan">
            ‹
          </button>
          <button className="btn btn-ghost px-3" onClick={() => go(week + 1)} disabled={week >= s.raceWeek} aria-label="Nästa vecka">
            ›
          </button>
        </div>
      }
    >
      <div className="card">
        <p className="text-soft text-sm font-semibold">
          {prettyDate(dates[0])} – {prettyDate(dates[6])}
          {phase ? ` · ${phase.name}` : ''}
          {isDeload(s, week) ? ' · Avlastningsvecka 💆‍♀️' : ''}
        </p>
        {week >= s.restartWeek ? (
          <p className="mt-1">
            {doneCount}/{total} pass klara · ≈ {plannedRunKm(sessions)} km löpning planerat
          </p>
        ) : (
          <p className="mt-1">Före appen – planen började V{s.restartWeek}.</p>
        )}
        {week >= s.restartWeek && (
          <Link to={`/garmin?vecka=${week}`} className="btn btn-primary mt-3 w-full">
            ⌚ Skicka veckan till Garmin
          </Link>
        )}
        {dirty && (
          <Link to={`/garmin?vecka=${week}`} className="btn btn-outline mt-2 w-full">
            Pass har ändrats – skicka uppdatering
          </Link>
        )}
      </div>

      {historyWeek(week) && <HistoryCard h={historyWeek(week)!} s={s} />}

      {warnings.map((w) => (
        <div key={w} className="card-soft border-l-4 border-[#9a4a00] text-sm" role="alert">
          ⚠️ {w}
        </div>
      ))}

      {week >= s.restartWeek && dates.map((date) => {
        const items = sessions.filter((x) => x.date === date);
        return (
          <section key={date} className={`card ${date === d ? 'ring-2 ring-pink' : ''}`}>
            <h2 className="text-soft mb-1 text-sm font-semibold">
              {dayShort(date)} {prettyDate(date)}
            </h2>
            {items.length === 0 && <p className="text-soft">–</p>}
            {items.map((x) => (
              <button key={x.id} className="flex w-full items-center gap-3 py-1.5 text-left" onClick={() => open(x)}>
                <span className="text-2xl" aria-hidden>
                  {KIND_EMOJI[x.kind]}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{x.title}</span>
                  {x.run && (
                    <span className="text-soft text-sm">
                      💗 {x.run.hr[0]}–{x.run.hr[1]} · {x.run.distanceText}
                    </span>
                  )}
                  {x.date !== x.originalDate && <span className="text-soft block text-xs">Flyttat från {dayShort(x.originalDate).toLowerCase()}</span>}
                </span>
                <StatusChip s={x} past={x.date < d} />
              </button>
            ))}
          </section>
        );
      })}

      {week >= s.restartWeek && (
        <button
          className="btn btn-outline w-full whitespace-normal py-2"
          onClick={async () => {
            const free = dates.find((x) => x >= d && !sessions.some((y) => y.date === x && y.type === 'strength')) ?? dates[4];
            await addExtraSession(free, week);
          }}
        >
          ✨ Lägg till valfritt extrapass (bröst, axlar, triceps)
        </button>
      )}

      <Sheet open={!!sel} onClose={() => setSel(null)} title={sel?.title ?? ''}>
        {sel && (
          <>
            <SessionDetail s={sel} />
            <div className="mt-4 grid grid-cols-2 gap-2">
              {sel.type === 'strength' && sel.status !== 'done' && (
                <button
                  className="btn btn-primary col-span-2"
                  onClick={async () => {
                    const w = await startWorkout(sel, sel.kind, sel.date);
                    nav(`/logga/${w.id}`);
                  }}
                >
                  {sel.workoutLogId ? 'Fortsätt passet' : 'Starta passet'}
                </button>
              )}
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setMoving(sel);
                  setSel(null);
                }}
              >
                📅 Flytta
              </button>
              {sel.status !== 'done' ? (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await updateSession(sel.id, { status: 'done' });
                    setSel(null);
                  }}
                >
                  ✓ Markera klart
                </button>
              ) : (
                <button
                  className="btn btn-ghost"
                  onClick={async () => {
                    await updateSession(sel.id, { status: sel.date !== sel.originalDate ? 'moved' : 'planned' });
                    setSel(null);
                  }}
                >
                  Ångra klart
                </button>
              )}
              {sel.status !== 'skipped' && sel.status !== 'done' && sel.kind !== 'rest' && (
                <button
                  className="btn btn-ghost col-span-2"
                  onClick={async () => {
                    await updateSession(sel.id, { status: 'skipped', garminDirty: !!sel.garminName });
                    setSel(null);
                  }}
                >
                  Hoppa över
                </button>
              )}
              {sel.garminName && <p className="text-soft col-span-2 text-xs">Garmin: {sel.garminName}</p>}
              {sel.run && <HrBadge hr={sel.run.hr} />}
            </div>
          </>
        )}
      </Sheet>

      <Sheet open={!!moving} onClose={() => setMoving(null)} title={`Flytta ${moving?.title.toLowerCase() ?? ''}`}>
        {moving && (
          <MovePicker
            session={moving}
            dates={dates}
            all={sessions}
            onPick={async (date) => {
              await moveSession(moving.id, date);
              setMoving(null);
            }}
          />
        )}
      </Sheet>
    </Page>
  );
}

function MovePicker({ session, dates, all, onPick }: { session: PlannedSession; dates: string[]; all: PlannedSession[]; onPick: (d: string) => void }) {
  return (
    <div className="space-y-2">
      {dates.map((date) => {
        const preview = all.map((x) => (x.id === session.id ? { ...x, date } : x));
        const w = scheduleWarnings(preview);
        const on = all.filter((x) => x.date === date && x.id !== session.id);
        return (
          <button key={date} className={`card-soft block w-full text-left ${date === session.date ? 'ring-2 ring-pink' : ''}`} onClick={() => onPick(date)}>
            <span className="font-semibold">
              {dayShort(date)} {prettyDate(date)}
            </span>
            <span className="text-soft block text-sm">{on.map((x) => x.title).join(', ') || 'Ledig'}</span>
            {w.length > 0 && <span className="block text-sm text-[#9a4a00] dark:text-[#ffc38a]">⚠️ {w[0]}</span>}
          </button>
        );
      })}
    </div>
  );
}
