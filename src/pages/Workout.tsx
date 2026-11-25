import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate, useParams } from 'react-router-dom';
import { db, uid } from '../db/db';
import { deleteSet, detectPrs, finishWorkout, prefillFor, saveSet, workoutSummary, type Prefill } from '../db/repo';
import { useSettings } from '../hooks';
import { alternativesFor, exercise } from '../lib/exercises';
import { celebrate, chime, keepAwake, reacquireOnVisible, unlockAudio } from '../lib/fx';
import { fmtDuration, prettyDate } from '../lib/dates';
import { buildStrength } from '../lib/plan/strength';
import type { PR, SetLog, StrengthItem, WorkoutLog } from '../lib/types';
import { itemTarget } from '../components/SessionDetail';
import { Page, Sheet, Toast } from '../components/ui';

const PR_TEXT: Record<PR['kind'], string> = {
  heaviest: 'Ny tyngsta vikt',
  mostReps: 'Flest reps',
  longestHold: 'Längsta håll',
  lowestAssist: 'Lägsta motvikt',
};

export default function Workout() {
  const { id } = useParams();
  const nav = useNavigate();
  const s = useSettings();
  const workout = useLiveQuery(() => (id ? db.workoutLogs.get(id) : undefined), [id]);
  // Wrappas i ett objekt så att "laddar" (undefined) skiljs från "inget planerat pass"
  // useLiveQuery behåller förra resultatet medan en ny fråga körs – därför taggas svaret med id:t.
  const sessionQ = useLiveQuery(
    async () => ({ forId: workout?.id, s: workout?.sessionId ? await db.sessions.get(workout.sessionId) : undefined }),
    [workout?.id, workout?.sessionId],
  );
  const sessionReady = !!workout && sessionQ?.forId === workout.id;
  const session = sessionReady ? sessionQ?.s : undefined;
  const sets = useLiveQuery(() => (id ? db.setLogs.where('workoutLogId').equals(id).filter((x) => !x.deleted).toArray() : []), [id]) ?? [];
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof workoutSummary>> | null>(null);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const plan = useMemo(() => {
    if (!sessionReady) return undefined;
    if (session?.strength) return session.strength;
    if (workout) return buildStrength(workout.kind === 'gymB' ? 'gymB' : workout.kind === 'gymExtra' ? 'gymExtra' : 'gymA', 'base', 7, { deload: false, pullupTest: false });
    return undefined;
  }, [sessionReady, session, workout]);

  // Wake Lock
  useEffect(() => {
    if (workout?.status !== 'active') return;
    void keepAwake(true);
    const off = reacquireOnVisible(() => true);
    return () => {
      off();
      void keepAwake(false);
    };
  }, [workout?.status]);

  const startRest = useCallback(
    (sec: number) => {
      setRestEnd(Date.now() + sec * 1000);
    },
    [],
  );

  if (!workout || !plan) return <Page title="Laddar…">{null}</Page>;

  if (summary) return <Summary summary={summary} name={s.name} onClose={() => nav('/')} />;

  const doneSets = sets.filter((x) => x.done).length;

  return (
    <Page
      back
      title={<span className="text-xl">{workout.title}</span>}
      action={
        workout.status === 'active' ? (
          <button className="btn btn-primary" onClick={() => setConfirmEnd(true)}>
            Klar
          </button>
        ) : (
          <span className="chip">Klart ✓</span>
        )
      }
    >
      <Toast msg={toast} onDone={() => setToast(null)} />
      <p className="text-soft -mt-2 text-sm">
        {prettyDate(workout.date)} · {plan.intensityNote} · {doneSets} set klara
      </p>
      {plan.loadFactor < 1 && <p className="card-soft text-sm">Vikterna är förslag ca {Math.round((1 - plan.loadFactor) * 100)} % lättare den här gången.</p>}

      {plan.items.map((item, idx) => (
        <ExerciseCard
          key={`${idx}-${item.exerciseId}`}
          slot={`${idx}:${item.exerciseId}`}
          item={item}
          workout={workout}
          sets={sets}
          loadFactor={plan.loadFactor}
          defaultRest={s.restSeconds}
          onDone={async (set, rest) => {
            unlockAudio();
            startRest(rest);
            const prs = await detectPrs(set);
            if (prs.length) {
              await db.setLogs.update(set.id, { isPr: true });
              celebrate('pr');
              setToast(`🏆 ${PR_TEXT[prs[0].kind]}: ${exercise(set.exerciseId).name}!`);
            }
          }}
        />
      ))}

      <RestTimer end={restEnd} sound={s.soundOn} onAdjust={(d) => setRestEnd((e) => (e ? e + d * 1000 : e))} onSkip={() => setRestEnd(null)} />

      <Sheet open={confirmEnd} onClose={() => setConfirmEnd(false)} title="Avsluta passet?">
        <p>
          {doneSets} set klara. Set som inte är bockade sparas inte som genomförda.
        </p>
        <button
          className="btn btn-primary mt-4 w-full"
          onClick={async () => {
            await finishWorkout(workout.id);
            const sum = await workoutSummary(workout.id);
            setConfirmEnd(false);
            setRestEnd(null);
            void keepAwake(false);
            setSummary(sum);
            celebrate(sum.prs.length ? 'milestone' : 'hearts');
          }}
        >
          Ja, avsluta 💖
        </button>
        <button className="btn btn-ghost mt-2 w-full" onClick={() => nav('/')}>
          Pausa – fortsätt senare
        </button>
      </Sheet>
    </Page>
  );
}

// ---------------------------------------------------------------------------

function ExerciseCard({
  slot,
  item,
  workout,
  sets,
  loadFactor,
  defaultRest,
  onDone,
}: {
  slot: string;
  item: StrengthItem;
  workout: WorkoutLog;
  sets: SetLog[];
  loadFactor: number;
  defaultRest: number;
  onDone: (s: SetLog, restSec: number) => void;
}) {
  const exId = workout.swaps[slot] ?? item.exerciseId;
  const ex = exercise(exId);
  const mine = sets.filter((x) => x.slotExerciseId === slot).sort((a, b) => a.setIndex - b.setIndex);
  const [prefill, setPrefill] = useState<Prefill | null>(null);
  const [swapOpen, setSwapOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  const inited = useRef('');

  useEffect(() => {
    let cancelled = false;
    prefillFor(exId, item, workout.id, loadFactor).then((p) => !cancelled && setPrefill(p));
    return () => {
      cancelled = true;
    };
  }, [exId, item, workout.id, loadFactor]);

  // Skapa utkast-set förifyllda från förra gången (en gång per övning)
  useEffect(() => {
    if (!prefill || workout.status !== 'active' || item.role === 'warmup') return;
    if (inited.current === exId) return;
    inited.current = exId;
    void db.transaction('rw', db.setLogs, async () => {
      const existing = await db.setLogs
        .where('workoutLogId')
        .equals(workout.id)
        .filter((x) => x.slotExerciseId === slot && !x.deleted)
        .count();
      if (existing) return;
      const rows: SetLog[] = Array.from({ length: item.sets }, (_, i) => draftSet(i, exId, slot, workout, item, prefill));
      await db.setLogs.bulkPut(rows);
    });
  }, [prefill, exId, slot, workout, item]);

  if (item.role === 'warmup') {
    return (
      <section className="card-soft flex items-center gap-3">
        <span className="text-2xl" aria-hidden>
          🔥
        </span>
        <div>
          <p className="font-semibold">Uppvärmning 5–8 min</p>
          <p className="text-soft text-sm">Cykel eller roddmaskin + rörlighet för höften</p>
        </div>
      </section>
    );
  }

  const last = prefill?.last?.filter((x) => x.done);
  const lastText = last?.length ? lastSummary(last, ex.unit, !!ex.assisted) : null;
  const restSec = item.restSec ?? defaultRest;
  const alts = alternativesFor(item.exerciseId);
  const allDone = mine.length > 0 && mine.every((x) => x.done);

  return (
    <section className={`card ${allDone ? 'opacity-80' : ''}`} aria-label={ex.name}>
      <div className="flex items-start gap-2">
        <div className="flex-1">
          <h2 className="text-lg font-bold leading-tight">
            {allDone && '✅ '}
            {ex.name}
          </h2>
          <p className="text-soft text-sm">
            {item.role === 'test' ? item.note : itemTarget(item)}
            {item.note && item.role !== 'test' ? ` · ${item.note}` : ''}
          </p>
          {lastText && <p className="text-sm font-semibold">förra: {lastText}</p>}
          {prefill?.suggestion.reason && <p className="text-accent text-sm font-semibold">{prefill.suggestion.reason}</p>}
          {!lastText && !ex.bodyweight && <p className="text-soft text-sm">Första gången – välj en vikt som känns som RPE 7 ✨</p>}
        </div>
        {(alts.length > 0 || workout.swaps[slot]) && (
          <button className="btn btn-ghost px-3 text-sm" onClick={() => setSwapOpen(true)} aria-label={`Byt ${ex.name}`}>
            ⇄ Byt
          </button>
        )}
      </div>

      <div className="mt-3 space-y-2">
        {mine.map((set, i) => (
          <SetRow
            key={set.id}
            n={i + 1}
            set={set}
            unit={ex.unit}
            assisted={!!ex.assisted}
            bodyweight={!!ex.bodyweight}
            step={ex.increment || 2.5}
            onChange={(patch) => saveSet({ ...set, ...patch })}
            onToggle={async () => {
              const next = { ...set, done: !set.done, doneAt: !set.done ? Date.now() : undefined, updatedAt: Date.now() };
              await saveSet(next);
              if (next.done) {
                // Fyll i samma vikt på kommande set som saknar vikt
                const key = ex.assisted ? 'assistKg' : 'weightKg';
                for (const later of mine.slice(i + 1)) {
                  if (!later.done && later[key] == null && next[key] != null) await saveSet({ ...later, [key]: next[key] });
                }
                onDone(next, restSec);
              }
            }}
          />
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className="btn btn-ghost text-sm"
          onClick={() => {
            const prev = mine.at(-1);
            void saveSet({
              ...(prev ?? draftSet(0, exId, slot, workout, item, prefill)),
              id: uid(),
              setIndex: (prev?.setIndex ?? -1) + 1,
              done: false,
              doneAt: undefined,
              isPr: false,
            });
          }}
        >
          + Set
        </button>
        {mine.length > 0 && !mine.at(-1)!.done && (
          <button className="btn btn-ghost text-sm" onClick={() => deleteSet(mine.at(-1)!.id)}>
            − Set
          </button>
        )}
        <button className="btn btn-ghost text-sm" onClick={() => setNoteOpen(true)}>
          {workout.exerciseRpe[slot] ? `RPE ${workout.exerciseRpe[slot]}` : 'RPE'}
          {workout.notes[slot] ? ' · 📝' : ' / anteckning'}
        </button>
      </div>

      <Sheet open={swapOpen} onClose={() => setSwapOpen(false)} title={`Byt ut ${exercise(item.exerciseId).name.toLowerCase()}`}>
        <p className="text-soft mb-2 text-sm">Historiken sparas per övning, så inget försvinner.</p>
        <div className="space-y-2">
          {[exercise(item.exerciseId), ...alts].map((a) => (
            <button
              key={a.id}
              className={`card-soft block w-full text-left font-semibold ${a.id === exId ? 'ring-2 ring-pink' : ''}`}
              onClick={async () => {
                const swaps = { ...workout.swaps };
                if (a.id === item.exerciseId) delete swaps[slot];
                else swaps[slot] = a.id;
                // Ta bort ej klara utkast så att nya förifylls för den valda övningen
                const drafts = mine.filter((x) => !x.done);
                await db.transaction('rw', db.workoutLogs, db.setLogs, async () => {
                  await db.workoutLogs.update(workout.id, { swaps, updatedAt: Date.now() });
                  for (const d of drafts) await db.setLogs.update(d.id, { deleted: true, updatedAt: Date.now() });
                });
                inited.current = '';
                setSwapOpen(false);
              }}
            >
              {a.name}
            </button>
          ))}
        </div>
      </Sheet>

      <Sheet open={noteOpen} onClose={() => setNoteOpen(false)} title={ex.name}>
        <p className="mb-2 font-semibold">Hur tungt kändes det? (RPE, valfritt)</p>
        <div className="grid grid-cols-5 gap-2">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((r) => (
            <button
              key={r}
              className={`btn ${workout.exerciseRpe[slot] === r ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => db.workoutLogs.update(workout.id, { exerciseRpe: { ...workout.exerciseRpe, [slot]: r }, updatedAt: Date.now() })}
            >
              {r}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="font-semibold">Anteckning</span>
          <textarea
            className="field mt-1 min-h-24"
            defaultValue={workout.notes[slot] ?? ''}
            onBlur={(e) => db.workoutLogs.update(workout.id, { notes: { ...workout.notes, [slot]: e.target.value }, updatedAt: Date.now() })}
            placeholder="T.ex. sätesinställning, känsla, teknik…"
          />
        </label>
        <button className="btn btn-primary mt-3 w-full" onClick={() => setNoteOpen(false)}>
          Klar
        </button>
      </Sheet>
    </section>
  );
}

function draftSet(i: number, exId: string, slot: string, workout: WorkoutLog, item: StrengthItem, prefill: Prefill | null): SetLog {
  const ex = exercise(exId);
  const lastSet = prefill?.last?.filter((x) => x.done)[i] ?? prefill?.last?.filter((x) => x.done).at(-1);
  const sug = prefill?.suggestion;
  const w = sug?.weightKg ?? (ex.assisted ? lastSet?.assistKg : lastSet?.weightKg);
  const reps = sug?.direction === 'up' ? item.repMin : (lastSet?.reps ?? item.repMax);
  return {
    id: uid(),
    workoutLogId: workout.id,
    exerciseId: exId,
    slotExerciseId: slot,
    setIndex: i,
    date: workout.date,
    weightKg: !ex.assisted && !ex.bodyweight ? w : undefined,
    assistKg: ex.assisted ? w : undefined,
    reps: ex.unit === 'reps' ? reps : undefined,
    seconds: ex.unit === 'seconds' ? (lastSet?.seconds ?? item.repMin) : undefined,
    done: false,
    source: 'app',
    updatedAt: Date.now(),
  };
}

function lastSummary(last: SetLog[], unit: 'reps' | 'seconds', assisted: boolean) {
  const s = last[0];
  if (unit === 'seconds') return last.map((x) => `${x.seconds ?? 0} s`).join(', ');
  const kg = assisted ? s.assistKg : s.weightKg;
  const reps = last.map((x) => x.reps ?? 0);
  const same = reps.every((r) => r === reps[0]);
  const w = kg != null ? `${fmtKg(kg)} kg${assisted ? ' motvikt' : ''} × ` : '';
  return `${w}${same ? reps[0] : reps.join('/')}${same && last.length > 1 ? ` (${last.length} set)` : ''}`;
}

const fmtKg = (n: number) => n.toLocaleString('sv-SE', { maximumFractionDigits: 2 });

function SetRow({
  n,
  set,
  unit,
  assisted,
  bodyweight,
  step,
  onChange,
  onToggle,
}: {
  n: number;
  set: SetLog;
  unit: 'reps' | 'seconds';
  assisted: boolean;
  bodyweight: boolean;
  step: number;
  onChange: (p: Partial<SetLog>) => void;
  onToggle: () => void;
}) {
  const wKey = assisted ? 'assistKg' : 'weightKg';
  const showWeight = !bodyweight || assisted;
  return (
    <div className={`flex items-center gap-1.5 rounded-2xl p-1 ${set.done ? 'bg-[#d8f5e6] dark:bg-[#14432c]' : 'bg-surface-2'}`}>
      <span className="w-5 text-center text-sm font-bold" aria-label={`Set ${n}`}>
        {set.isPr ? '🏆' : n}
      </span>
      {showWeight && (
        <Stepper
          label={assisted ? 'motvikt kg' : 'kg'}
          value={set[wKey]}
          step={step || 2.5}
          decimals
          onChange={(v) => onChange({ [wKey]: v })}
        />
      )}
      {unit === 'reps' ? (
        <Stepper label="reps" value={set.reps} step={1} onChange={(v) => onChange({ reps: v })} />
      ) : (
        <Stepper label="sek" value={set.seconds} step={5} onChange={(v) => onChange({ seconds: v })} />
      )}
      <button
        className={`ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold ${set.done ? 'bg-[#1b7a4b] text-white' : 'btn-primary'}`}
        onClick={onToggle}
        aria-label={set.done ? `Ångra set ${n}` : `Set ${n} klart`}
        aria-pressed={set.done}
      >
        ✓
      </button>
    </div>
  );
}

function Stepper({ label, value, step, decimals, onChange }: { label: string; value?: number; step: number; decimals?: boolean; onChange: (v: number | undefined) => void }) {
  const [text, setText] = useState<string | null>(null);
  const shown = text ?? (value != null ? fmtKg(value) : '');
  const bump = (d: number) => onChange(Math.max(0, Math.round(((value ?? 0) + d) * 100) / 100));
  return (
    <div className="flex items-center">
      <button className="h-11 w-8 rounded-l-xl bg-surface text-lg font-bold" onClick={() => bump(-step)} aria-label={`Minska ${label}`}>
        −
      </button>
      <label className="relative">
        <span className="sr-only">{label}</span>
        <input
          className="h-11 w-12 bg-surface text-center text-lg font-bold outline-none"
          inputMode={decimals ? 'decimal' : 'numeric'}
          value={shown}
          onFocus={(e) => {
            setText(shown);
            e.target.select();
          }}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => {
            const v = parseFloat((text ?? '').replace(',', '.'));
            onChange(Number.isFinite(v) ? v : undefined);
            setText(null);
          }}
        />
        <span className="text-soft pointer-events-none absolute inset-x-0 -bottom-0.5 text-center text-[10px] leading-none">{label}</span>
      </label>
      <button className="h-11 w-8 rounded-r-xl bg-surface text-lg font-bold" onClick={() => bump(step)} aria-label={`Öka ${label}`}>
        +
      </button>
    </div>
  );
}

function RestTimer({ end, sound, onAdjust, onSkip }: { end: number | null; sound: boolean; onAdjust: (d: number) => void; onSkip: () => void }) {
  const [now, setNow] = useState(Date.now());
  const rang = useRef<number | null>(null);
  useEffect(() => {
    if (!end) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [end]);
  const left = end ? Math.ceil((end - now) / 1000) : 0;
  useEffect(() => {
    if (end && left <= 0 && rang.current !== end) {
      rang.current = end;
      if (sound) chime();
    }
  }, [left, end, sound]);
  if (!end) return null;
  const done = left <= 0;
  return (
    <div
      className={`fixed inset-x-3 bottom-[calc(64px+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-2 rounded-full px-3 py-2 shadow-lg ${done ? 'timer-done bg-[#1b7a4b] text-white' : 'grad text-on-grad'}`}
      role="timer"
      aria-live={done ? 'assertive' : 'off'}
    >
      <span className="font-display min-w-20 pl-2 text-2xl font-bold tabular-nums">{done ? 'Kör! 💪' : fmtDuration(left)}</span>
      <span className="flex-1 text-sm font-semibold">{done ? 'Vilan är slut' : 'Vila'}</span>
      {!done && (
        <>
          <button className="h-10 w-12 rounded-full bg-white/60 font-bold" onClick={() => onAdjust(-15)} aria-label="15 sekunder kortare">
            −15
          </button>
          <button className="h-10 w-12 rounded-full bg-white/60 font-bold" onClick={() => onAdjust(15)} aria-label="15 sekunder längre">
            +15
          </button>
        </>
      )}
      <button className="h-10 rounded-full bg-white/70 px-3 font-bold text-on-grad" onClick={onSkip}>
        {done ? 'OK' : 'Hoppa'}
      </button>
    </div>
  );
}

function Summary({ summary, name, onClose }: { summary: Awaited<ReturnType<typeof workoutSummary>>; name: string; onClose: () => void }) {
  return (
    <Page>
      <div className="grad pop -mx-4 rounded-b-[32px] px-6 pb-10 pt-[max(env(safe-area-inset-top),2rem)] text-center text-on-grad">
        <p className="text-6xl" aria-hidden>
          💖
        </p>
        <h1 className="mt-2 text-3xl font-bold">Bra jobbat, {name}!</h1>
        <p className="font-semibold">{summary.workout?.title}</p>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="card">
          <div className="font-display text-2xl font-bold">{summary.minutes}</div>
          <div className="text-soft text-xs">minuter</div>
        </div>
        <div className="card">
          <div className="font-display text-2xl font-bold">{summary.sets}</div>
          <div className="text-soft text-xs">set</div>
        </div>
        <div className="card">
          <div className="font-display text-2xl font-bold">{Math.round(summary.volume).toLocaleString('sv-SE')}</div>
          <div className="text-soft text-xs">kg volym</div>
        </div>
      </div>
      {summary.prs.length > 0 && (
        <section className="card">
          <h2 className="mb-2 text-lg font-semibold">🏆 Nya rekord</h2>
          <ul className="space-y-1">
            {summary.prs.map((p) => (
              <li key={p.id}>
                <b>{exercise(p.exerciseId).name}</b>: {PR_TEXT[p.kind].toLowerCase()} –{' '}
                {p.kind === 'longestHold' ? `${p.value} s` : p.kind === 'mostReps' ? `${p.value} reps${p.weightKg ? ` på ${fmtKg(p.weightKg)} kg` : ''}` : `${fmtKg(p.value)} kg`}
              </li>
            ))}
          </ul>
        </section>
      )}
      <button className="btn btn-primary w-full text-lg" onClick={onClose}>
        Till startsidan
      </button>
    </Page>
  );
}
