import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useNavigate } from 'react-router-dom';
import { db, uid } from '../db/db';
import { startWorkout, updateSession } from '../db/repo';
import { useSettings, useToday } from '../hooks';
import { addDays, dayName, diffDays, prettyDate, weekNumber } from '../lib/dates';
import { phaseOf } from '../lib/plan/generator';
import { quoteOfDay } from '../lib/quotes';
import { applyReadiness, readinessCheck } from '../lib/rules';
import type { PlannedSession } from '../lib/types';
import StepRing from '../components/StepRing';
import SickCard from '../components/SickCard';
import { isSickDay } from '../lib/illness';
import SessionDetail from '../components/SessionDetail';
import { HrBadge, KIND_EMOJI, Page, Sheet, StatusChip, Toast } from '../components/ui';

function greeting() {
  const h = new Date().getHours();
  if (h < 10) return 'God morgon';
  if (h < 17) return 'Hej';
  return 'God kväll';
}

/** Stegsviten. Sjukdagar räknas varken med eller bryter sviten. */
export function stepStreak(days: { date: string; steps?: number }[], goal: number, todayD: string, sick: (d: string) => boolean = () => false) {
  const map = new Map(days.map((d) => [d.date, d.steps ?? 0]));
  let streak = 0;
  // Dagens dag räknas om målet redan är nått, annars börjar vi från igår
  let d = (map.get(todayD) ?? 0) >= goal ? todayD : addDays(todayD, -1);
  for (let guard = 0; guard < 400; guard++) {
    if ((map.get(d) ?? 0) >= goal) streak++;
    else if (!sick(d)) break;
    d = addDays(d, -1);
  }
  return streak;
}

export default function Today() {
  const s = useSettings();
  const d = useToday();
  const nav = useNavigate();
  const week = weekNumber(d, s.week1Start);
  const phase = phaseOf(s, week);
  const [detail, setDetail] = useState<PlannedSession | null>(null);
  const [weighOpen, setWeighOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const sessions = useLiveQuery(() => db.sessions.where('date').equals(d).toArray(), [d]) ?? [];
  const health = useLiveQuery(() => db.health.where('date').between(addDays(d, -14), d, true, true).toArray(), [d]) ?? [];
  const lastWeigh = useLiveQuery(() => db.weighIns.orderBy('date').filter((w) => !w.deleted).last(), []);
  const stepDays = useLiveQuery(() => db.health.where('date').between(addDays(d, -120), d, true, true).toArray(), [d]) ?? [];

  const todayH = health.find((h) => h.date === d);
  const history = health.filter((h) => h.date < d);
  const suggestions = readinessCheck(todayH, history, s.readiness);
  const main = sessions.find((x) => x.kind !== 'rest') ?? sessions[0];
  const daysLeft = diffDays(s.raceDate, d);
  const steps = todayH?.steps ?? 0;
  const illnesses = useLiveQuery(() => db.illness.filter((i) => !i.deleted).toArray(), []) ?? [];
  const sickNow = illnesses.some((i) => !i.to);
  const streak = stepStreak(stepDays, s.steps.goal, d, (x) => isSickDay(x, illnesses, d));

  async function start(x: PlannedSession) {
    if (x.type === 'strength') {
      const w = await startWorkout(x);
      nav(`/logga/${w.id}`);
    } else setDetail(x);
  }

  async function accept(idx: number) {
    if (!main) return;
    const adj = applyReadiness(main, suggestions[idx], s);
    if (!adj) {
      setToast('Inget att ändra i dagens pass 💖');
      return;
    }
    await updateSession(main.id, adj);
    setToast('Passet är justerat ✨ Kom ihåg att skicka en uppdatering till Garmin.');
  }

  async function undo(x: PlannedSession) {
    if (!x.adjustment) return;
    const o = x.adjustment.original;
    await updateSession(x.id, { ...o, type: o.run ? 'running' : o.strength ? 'strength' : x.type, adjustment: undefined, garminDirty: true });
  }

  return (
    <Page>
      <Toast msg={toast} onDone={() => setToast(null)} />
      <header className="grad -mx-4 -mt-3 rounded-b-[32px] px-5 pb-6 pt-[max(env(safe-area-inset-top),1rem)] text-on-grad">
        <p className="text-sm font-semibold capitalize opacity-80">
          {dayName(d)} {prettyDate(d)} · V{week}
          {phase ? ` · ${phase.name}` : ''}
        </p>
        <h1 className="text-3xl font-bold">
          {greeting()}, {s.name}! 💖
        </h1>
        {daysLeft >= 0 && (
          <p className="mt-1 font-semibold">
            {daysLeft === 0 ? 'Idag är det Göteborgsvarvet! 🏁' : `${daysLeft} dagar kvar till ${s.raceName} 🏃‍♀️`}
          </p>
        )}
      </header>

      {sickNow && <SickCard onToast={setToast} />}

      {/* Dagsform */}
      <section className="card" aria-labelledby="dagsform">
        <h2 id="dagsform" className="mb-2 text-lg font-semibold">
          Dagsform
        </h2>
        {todayH ? (
          <div className="grid grid-cols-3 gap-2 text-center">
            <Metric label="Sömn" value={todayH.sleepH != null ? `${todayH.sleepH.toFixed(1)} h` : '–'} warn={todayH.sleepH != null && todayH.sleepH < s.readiness.minSleepH} />
            <Metric label="Vilopuls" value={todayH.restingHr ?? '–'} warn={suggestions.some((x) => x.rule === 'rhr')} />
            <Metric label="HRV" value={todayH.hrv ? `${todayH.hrv} ms` : '–'} sub={hrvLabel(todayH.hrvStatus)} warn={suggestions.some((x) => x.rule === 'hrv')} />
          </div>
        ) : (
          <p className="text-soft">Ingen morgondata än. Den kommer med nästa Garmin-synk ☁️</p>
        )}
        {!sickNow && suggestions.length > 0 && main && !main.adjustment && main.status === 'planned' && (
          <div className="mt-3 space-y-2">
            {suggestions.map((sg, i) => (
              <div key={sg.rule} className="card-soft">
                <p className="font-semibold">{sg.title}</p>
                <p className="text-sm">{sg.text}</p>
                <button className="btn btn-primary mt-2 w-full" onClick={() => accept(i)}>
                  Ändra dagens pass
                </button>
              </div>
            ))}
          </div>
        )}
        {!sickNow && suggestions.length === 0 && todayH && <p className="mt-2 text-sm">Allt ser bra ut – kör enligt plan ✨</p>}
      </section>

      {/* Dagens pass */}
      {sessions.length === 0 && <section className="card">Inget pass planerat idag 🌸</section>}
      {sessions.map((x) => (
        <section key={x.id} className="card">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-soft text-sm font-semibold">Dagens pass</p>
              <h2 className="text-2xl font-bold">
                <span aria-hidden>{KIND_EMOJI[x.kind]}</span> {x.title}
              </h2>
              {x.subtitle && <p className="text-soft">{x.subtitle}</p>}
            </div>
            <StatusChip s={x} />
          </div>
          {x.run && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <HrBadge hr={x.run.hr} big />
              <span className="font-semibold">Håll pulsen under {x.run.hr[1]}!</span>
            </div>
          )}
          {x.adjustment?.rule === 'sick' && x.status === 'skipped' && <p className="card-soft mt-3 text-sm">🤒 Pausat medan du är sjuk. Vila är det bästa du kan göra nu.</p>}
          {x.adjustment && !(x.adjustment.rule === 'sick' && x.status === 'skipped') && (
            <p className="card-soft mt-3 text-sm">
              ✨ {x.adjustment.rule === 'sick' ? 'Lättare pass efter sjukdomen.' : 'Justerat efter dagsformen.'}{' '}
              <button className="text-accent font-semibold underline" onClick={() => undo(x)}>
                Ångra
              </button>
            </p>
          )}
          <div className="mt-4 flex gap-2">
            {x.kind !== 'rest' && x.status !== 'done' && x.status !== 'skipped' && (
              <button className="btn btn-primary flex-1 text-lg" onClick={() => start(x)}>
                {x.type === 'strength' ? (x.workoutLogId ? 'Fortsätt passet' : 'Starta') : 'Visa passet'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={() => setDetail(x)}>
              Detaljer
            </button>
          </div>
        </section>
      ))}

      {/* Steg */}
      <section className="card flex items-center gap-4">
        <StepRing steps={steps} goal={s.steps.goal} bonus={s.steps.bonus} />
        <div className="flex-1">
          <h2 className="text-lg font-semibold">Steg idag</h2>
          <p className="text-xl font-bold">🔥 {streak} {streak === 1 ? 'dag' : 'dagar'} i rad</p>
          <p className="text-soft text-sm">
            {steps >= s.steps.bonus
              ? 'Guldring! 🏅'
              : steps >= s.steps.goal
                ? `Målet klart! ${(s.steps.bonus - steps).toLocaleString('sv-SE')} kvar till guld`
                : `${(s.steps.goal - steps).toLocaleString('sv-SE')} steg kvar`}
          </p>
          {main?.kind === 'rest' && <p className="text-sm font-semibold">Promenaddag 🚶‍♀️</p>}
        </div>
      </section>

      {/* Vikt */}
      <section className="card flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Vikt</h2>
          <p className="text-soft text-sm">{lastWeigh ? `Senast ${lastWeigh.kg.toFixed(1)} kg (${prettyDate(lastWeigh.date)})` : 'Första invägningen blir ditt startvärde'}</p>
        </div>
        <button className="btn btn-primary" onClick={() => setWeighOpen(true)}>
          + Väg in
        </button>
      </section>

      {!sickNow && <SickCard onToast={setToast} />}

      <p className="font-display px-2 py-2 text-center text-lg font-semibold">“{quoteOfDay(d, s.customQuotes)}”</p>

      <Sheet open={!!detail} onClose={() => setDetail(null)} title={detail?.title ?? ''}>
        {detail && <SessionDetail s={detail} />}
      </Sheet>
      <WeighSheet open={weighOpen} onClose={() => setWeighOpen(false)} last={lastWeigh?.kg} date={d} onSaved={() => setToast('Sparat 💖 Trenden är det som räknas.')} />
    </Page>
  );
}

function hrvLabel(s?: string) {
  if (!s) return undefined;
  return s === 'BALANCED' ? 'balanserad' : s === 'UNBALANCED' ? 'obalanserad' : s === 'LOW' ? 'låg' : s === 'POOR' ? 'låg' : undefined;
}

function Metric({ label, value, sub, warn }: { label: string; value: string | number; sub?: string; warn?: boolean }) {
  return (
    <div className={`card-soft ${warn ? 'ring-2 ring-[#9a4a00]' : ''}`}>
      <div className="text-soft text-xs font-semibold">{label}</div>
      <div className="font-display text-xl font-bold">
        {warn && <span aria-label="varning">⚠️ </span>}
        {value}
      </div>
      {sub && <div className="text-soft text-xs">{sub}</div>}
    </div>
  );
}

export function WeighSheet({ open, onClose, last, date, onSaved }: { open: boolean; onClose: () => void; last?: number; date: string; onSaved: () => void }) {
  const [val, setVal] = useState('');
  const kg = parseFloat((val || (last ? String(last) : '')).replace(',', '.'));
  async function save() {
    if (!kg || kg < 30 || kg > 200) return;
    await db.weighIns.put({ id: uid(), date, kg: Math.round(kg * 10) / 10, source: 'app', updatedAt: Date.now() });
    setVal('');
    onClose();
    onSaved();
  }
  return (
    <Sheet open={open} onClose={onClose} title="Väg in">
      <label className="block">
        <span className="text-soft text-sm">Vikt i kg</span>
        <div className="mt-1 flex items-center gap-2">
          <button className="btn btn-ghost h-14 w-14 text-xl" onClick={() => setVal(String(((kg || 60) - 0.1).toFixed(1)))} aria-label="Minska 0,1 kg">
            −
          </button>
          <input
            className="field h-14 text-center text-2xl font-bold"
            inputMode="decimal"
            placeholder={last ? last.toFixed(1) : '60,0'}
            value={val}
            onChange={(e) => setVal(e.target.value)}
            autoFocus
          />
          <button className="btn btn-ghost h-14 w-14 text-xl" onClick={() => setVal(String(((kg || 60) + 0.1).toFixed(1)))} aria-label="Öka 0,1 kg">
            +
          </button>
        </div>
      </label>
      <button className="btn btn-primary mt-4 w-full" onClick={save} disabled={!kg}>
        Spara {kg ? `${kg.toFixed(1)} kg` : ''}
      </button>
    </Sheet>
  );
}
