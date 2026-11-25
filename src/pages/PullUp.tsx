import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { BADGES } from '../lib/badges';
import { prettyDate, weekNumber, weekStart } from '../lib/dates';
import { celebrate } from '../lib/fx';
import { PULLUP_STEPS, pullupStep } from '../lib/plan/strength';
import { C, Empty, TrendChart } from '../components/Charts';
import { Page, Section } from '../components/ui';

export default function PullUp() {
  const s = useSettings();
  const d = useToday();
  const week = weekNumber(d, s.week1Start);
  const step = pullupStep(Math.max(week, s.restartWeek));
  const sets = useLiveQuery(() => db.setLogs.where('exerciseId').anyOf(['dead-hang', 'flexed-hang', 'negative-pullup', 'assisted-pullup', 'pullup']).filter((x) => x.done && !x.deleted).toArray(), []) ?? [];
  const badges = useLiveQuery(() => db.badges.toArray(), []) ?? [];
  const has = (id: string) => badges.find((b) => b.id === id);

  const best = (id: string, key: 'seconds' | 'reps') => Math.max(0, ...sets.filter((x) => x.exerciseId === id).map((x) => x[key] ?? 0));
  const assist = sets.filter((x) => x.exerciseId === 'assisted-pullup' && x.assistKg != null && (x.reps ?? 0) >= 1);
  const lowestAssist = assist.length ? Math.min(...assist.map((x) => x.assistKg!)) : undefined;
  const byDate = new Map<string, number>();
  for (const x of assist) byDate.set(x.date, Math.min(byDate.get(x.date) ?? 999, x.assistKg!));
  const assistData = [...byDate].sort().map(([date, v]) => ({ label: prettyDate(date), v }));
  const tests = s.pullupTestWeeks.map((w) => ({ w, date: weekStart(w, s.week1Start) }));

  async function firstPullup() {
    await db.setLogs.put({ id: uid(), workoutLogId: 'manual-first-pullup', exerciseId: 'pullup', setIndex: 0, reps: 1, done: true, date: d, source: 'app', updatedAt: Date.now() });
    celebrate('milestone');
  }

  return (
    <Page title="Vägen till min första pull-up" back>
      <section className="card grad text-on-grad">
        <p className="text-sm font-semibold">Steg {step} av 4</p>
        <h2 className="text-2xl font-bold">{PULLUP_STEPS[step - 1].name}</h2>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <Stat label="Dead hang" value={best('dead-hang', 'seconds') ? `${best('dead-hang', 'seconds')} s` : '15 s*'} />
          <Stat label="Böjda armar" value={best('flexed-hang', 'seconds') ? `${best('flexed-hang', 'seconds')} s` : '–'} />
          <Stat label="Motvikt" value={lowestAssist != null ? `${lowestAssist} kg` : '–'} />
        </div>
        {!best('dead-hang', 'seconds') && <p className="mt-2 text-xs">* startvärde från 25 nov</p>}
      </section>

      <Section title="Milstolpar">
        <ul className="space-y-2">
          {BADGES.filter((b) => b.group === 'pullup').map((b) => {
            const got = has(b.id);
            return (
              <li key={b.id} className={`card-soft flex items-center gap-3 ${got ? '' : 'opacity-60'}`}>
                <span className={`text-3xl ${got ? '' : 'grayscale'}`} aria-hidden>
                  {b.icon}
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{b.name}</span>
                  <span className="text-soft text-sm">{got ? `Klart ${prettyDate(got.date)} 🎉` : b.desc}</span>
                </span>
              </li>
            );
          })}
        </ul>
        {!has('pu-first') && step >= 3 && (
          <button className="btn btn-primary mt-3 w-full" onClick={firstPullup}>
            Jag klarade min första pull-up! 🎉
          </button>
        )}
      </Section>

      <Section title="Motvikt i assisterad maskin">
        {assistData.length ? (
          <TrendChart data={assistData} x="label" unit=" kg" domain={[0, 'auto']} refY={{ y: 10, label: '10 kg' }} lines={[{ key: 'v', name: 'Motvikt', color: C.pink, dot: true }]} />
        ) : (
          <Empty text="Logga motvikten i Gym B så ser du hur den går ner mot noll 💪" />
        )}
      </Section>

      <Section title="Programmet">
        <ol className="space-y-2">
          {PULLUP_STEPS.map((p) => (
            <li key={p.step} className={`card-soft ${p.step === step ? 'ring-2 ring-pink' : ''}`}>
              <b>
                {p.step}. {p.name}
              </b>{' '}
              <span className="text-soft text-sm">{p.weeks}</span>
              <p className="text-sm">{STEP_TEXT[p.step - 1]}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Tester var 4:e vecka">
        <p className="text-soft mb-2 text-sm">Testet ligger i måndagens gympass: max dead hang, max hängtid med böjda armar, längsta negativa och lägsta motvikt för 5 reps.</p>
        <ul className="grid grid-cols-3 gap-2 text-center text-sm">
          {tests.map((t) => (
            <li key={t.w} className={`card-soft ${t.w === week ? 'ring-2 ring-pink' : ''}`}>
              <b>V{t.w}</b>
              <span className="text-soft block">{prettyDate(t.date)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

const STEP_TEXT = [
  'Mån: dead hang + skapulära pull-ups. Ons: assisterad maskin + inverterad rodd.',
  'Mån: häng med böjda armar. Ons: negativa (3–5 s ner) + assisterad med mindre motvikt.',
  'Mån: negativa 5–8 s + isometriska håll i tre lägen. Ons: låg motvikt eller lätt gummiband.',
  'Mån: singlar och kluster. Ons: negativa + "greasing the groove" – lätta försök under dagen.',
];

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white/40 p-2 dark:bg-black/20">
      <div className="text-xs font-semibold">{label}</div>
      <div className="font-display text-xl font-bold">{value}</div>
    </div>
  );
}
