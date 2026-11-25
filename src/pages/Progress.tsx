import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { exercise } from '../lib/exercises';
import { fmtDuration, prettyDate, weekNumber } from '../lib/dates';
import { HISTORY } from '../lib/history';
import { plannedRunKm } from '../lib/plan/generator';
import { e1rm, shareWithinCap } from '../lib/rules';
import { Bars, C, Empty, TrendChart, movingAvg } from '../components/Charts';
import { Page, Section } from '../components/ui';

const STRENGTH_IDS = ['squat', 'rdl', 'bulgarian', 'lat-pulldown', 'seated-row', 'pull-through', 'db-bench'];

export default function Progress() {
  const s = useSettings();
  const d = useToday();
  const cur = weekNumber(d, s.week1Start);
  const weigh = useLiveQuery(() => db.weighIns.filter((w) => !w.deleted).toArray(), []) ?? [];
  const acts = useLiveQuery(() => db.activities.toArray(), []) ?? [];
  const sessions = useLiveQuery(() => db.sessions.toArray(), []) ?? [];
  const health = useLiveQuery(() => db.health.toArray(), []) ?? [];
  const sets = useLiveQuery(() => db.setLogs.filter((x) => x.done && !x.deleted).toArray(), []) ?? [];
  const prs = useLiveQuery(() => db.prs.orderBy('date').reverse().toArray(), []) ?? [];
  const [exId, setExId] = useState('squat');

  const w = (date: string) => weekNumber(date, s.week1Start);
  const lastWeek = Math.min(Math.max(cur, 1), s.raceWeek);

  const weekly = useMemo(() => {
    const rows = [];
    for (let wk = 1; wk <= lastWeek; wk++) {
      const runs = acts.filter((a) => a.type === 'running' && w(a.date) === wk);
      const swims = acts.filter((a) => a.type === 'swimming' && w(a.date) === wk);
      const hist = HISTORY.find((h) => h.week === wk);
      const km = runs.reduce((t, a) => t + (a.distanceKm ?? 0), 0);
      const calm = runs.filter((a) => {
        const sess = sessions.find((x) => x.id === a.linkedSessionId);
        return sess ? sess.kind === 'easy' || sess.kind === 'long' : (a.distanceKm ?? 0) < 25;
      });
      const share = shareWithinCap(calm.filter((a) => a.withinCap !== undefined));
      const steps = health.filter((h) => w(h.date) === wk && h.steps != null);
      rows.push({
        v: `V${wk}`,
        km: +(km || hist?.runKm || 0).toFixed(1),
        plan: wk >= s.restartWeek ? plannedRunKm(sessions.filter((x) => x.week === wk)) : undefined,
        long: Math.max(0, ...runs.map((a) => a.distanceKm ?? 0), ...(hist?.runs.map((r) => r.km) ?? [])) || undefined,
        share: share != null ? Math.round(share * 100) : undefined,
        swim: swims.reduce((t, a) => t + (a.distanceKm ?? 0) * 1000, 0) || undefined,
        steps: steps.length ? Math.round(steps.reduce((t, h) => t + (h.steps ?? 0), 0) / steps.length) : undefined,
      });
    }
    return rows;
  }, [acts, sessions, health, lastWeek]); // eslint-disable-line react-hooks/exhaustive-deps

  const weightData = movingAvg(weigh.map((x) => ({ date: x.date, v: x.kg }))).map((p) => ({ ...p, label: prettyDate(p.date) }));
  const lastAvg = weightData.at(-1)?.avg;
  const avgAt = (daysAgo: number) => {
    const target = new Date(new Date(d).getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
    return [...weightData].reverse().find((p) => p.date <= target)?.avg;
  };
  const wkChange = lastAvg && avgAt(7) ? lastAvg - avgAt(7)! : undefined;
  const moChange = lastAvg && avgAt(30) ? lastAvg - avgAt(30)! : undefined;

  const strength = useMemo(() => {
    const byDate = new Map<string, number>();
    for (const x of sets.filter((x) => x.exerciseId === exId && x.weightKg && x.reps)) {
      byDate.set(x.date, Math.max(byDate.get(x.date) ?? 0, e1rm(x.weightKg!, x.reps!)));
    }
    return [...byDate].sort().map(([date, v]) => ({ label: prettyDate(date), v: Math.round(v * 10) / 10 }));
  }, [sets, exId]);

  const preds = health
    .filter((h) => h.raceTimes?.half)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((h) => ({ label: prettyDate(h.date), v: h.raceTimes!.half! / 60 }));

  const hasShare = weekly.some((r) => r.share != null);

  return (
    <Page title="Framsteg">
      <Section title="⚖️ Vikt – trend" right={<Link to="/vikt" className="text-accent text-sm font-semibold">Mått & mer ›</Link>}>
        {weightData.length ? (
          <>
            <div className="mb-2 flex flex-wrap gap-2">
              <span className="chip">Snitt {lastAvg?.toFixed(1).replace('.', ',')} kg</span>
              {wkChange != null && <span className="chip">Vecka {fmtDelta(wkChange)}</span>}
              {moChange != null && <span className="chip">Månad {fmtDelta(moChange)}</span>}
            </div>
            <TrendChart data={weightData} x="label" unit=" kg" lines={[{ key: 'v', name: 'Dagsvikt', color: C.rose, faded: true, dot: true }, { key: 'avg', name: '7-dagars', color: C.pink }]} />
            <p className="text-soft text-xs">Ljus linje = dagsvikt, rosa = 7-dagars snitt. Trenden är det som räknas 💖</p>
          </>
        ) : (
          <Empty text="Väg in på startsidan så syns trenden här." />
        )}
      </Section>

      <Section title="🏃‍♀️ Löpning per vecka">
        <Bars data={weekly} x="v" unit=" km" bars={[{ key: 'km', name: 'Sprungit', color: C.pink }, { key: 'plan', name: 'Plan', color: C.lav }]} />
        <p className="text-soft text-xs">Rosa = sprungit, lila = planerat. V1–V5 från dina veckosummor tills Garmin-datan är hämtad.</p>
      </Section>

      <Section title="💗 Andel lugn löptid inom pulstaket">
        {hasShare ? (
          <Bars data={weekly} x="v" unit=" %" refY={{ y: 80, label: 'mål 80 %' }} bars={[{ key: 'share', name: 'Inom tak', color: C.ok }]} />
        ) : (
          <Empty text="Fylls i när löppass med puls har synkats från Garmin." />
        )}
      </Section>

      <Section title="📏 Längsta passet per vecka">
        <Bars data={weekly} x="v" unit=" km" refY={{ y: 21.1, label: 'Varvet 21,1' }} bars={[{ key: 'long', name: 'Längsta', color: C.lav }]} />
      </Section>

      <Section title="💪 Styrka (uppskattad 1RM)">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {STRENGTH_IDS.map((id) => (
            <button key={id} className={`chip min-h-9 ${exId === id ? 'bg-pink-strong text-white' : ''}`} onClick={() => setExId(id)}>
              {exercise(id).name}
            </button>
          ))}
        </div>
        {strength.length ? <TrendChart data={strength} x="label" unit=" kg" lines={[{ key: 'v', name: '1RM', color: C.pink, dot: true }]} /> : <Empty text="Logga pass med den här övningen så syns kurvan." />}
      </Section>

      <Section title="🏁 Garmins prognos för halvmaran">
        {preds.length ? (
          <>
            <p className="mb-1 text-sm">
              Senast: <b>{fmtDuration(preds.at(-1)!.v * 60)}</b>
            </p>
            <TrendChart data={preds} x="label" unit=" min" lines={[{ key: 'v', name: 'Prognos', color: C.lav, dot: true }]} />
          </>
        ) : (
          <Empty text="Startvärde 25 nov: 2:09:27. Kurvan fylls på med Garmin-synken." />
        )}
      </Section>

      <Section title="🏊‍♀️ Simning per vecka">
        {weekly.some((r) => r.swim) ? <Bars data={weekly} x="v" unit=" m" bars={[{ key: 'swim', name: 'Simning', color: C.lav }]} /> : <Empty text="Bassängsim från klockan visas här." />}
      </Section>

      <Section title="👟 Steg – snitt per dag">
        {weekly.some((r) => r.steps) ? (
          <Bars data={weekly} x="v" refY={{ y: s.steps.goal, label: 'mål' }} bars={[{ key: 'steps', name: 'Steg/dag', color: C.pink }]} />
        ) : (
          <Empty text="Steg synkas från Garmin." />
        )}
      </Section>

      <Section title="🏆 Personliga rekord">
        {prs.length === 0 && <Empty text="Dina rekord dyker upp här när du loggar pass 💪" />}
        <ul className="space-y-1">
          {prs.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>{exercise(p.exerciseId).name}</span>
              <span className="text-right font-semibold">
                {p.kind === 'longestHold' ? `${p.value} s` : p.kind === 'lowestAssist' ? `${p.value} kg motvikt` : p.kind === 'mostReps' ? `${p.value} reps${p.weightKg ? ` @ ${p.weightKg} kg` : ''}` : `${p.value} kg`}
                <span className="text-soft ml-2 text-xs">{prettyDate(p.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </Page>
  );
}

const fmtDelta = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1).replace('.', ',')} kg`;
