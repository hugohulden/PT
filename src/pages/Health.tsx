import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { addDays, prettyDate } from '../lib/dates';
import { Bars, C, Empty, TrendChart } from '../components/Charts';
import { Page, Section } from '../components/ui';

export default function Health() {
  const s = useSettings();
  const d = useToday();
  const [days, setDays] = useState(30);
  const rows = useLiveQuery(() => db.health.where('date').between(addDays(d, -days + 1), d, true, true).toArray(), [d, days]) ?? [];
  const data = rows.sort((a, b) => a.date.localeCompare(b.date)).map((h) => ({ label: prettyDate(h.date), sömn: h.sleepH, vilopuls: h.restingHr, hrv: h.hrv, intensitet: h.intensityMin, poäng: h.sleepScore }));
  const avg = (k: 'sleepH' | 'restingHr' | 'hrv') => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined;
  };

  return (
    <Page title="Hälsa" back>
      <div className="flex gap-2">
        {[14, 30, 90].map((n) => (
          <button key={n} className={`btn flex-1 ${days === n ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setDays(n)}>
            {n} dagar
          </button>
        ))}
      </div>
      {rows.length === 0 && <div className="card text-soft">Sömn, vilopuls och HRV kommer från Garmin-synken. Startvärden 25 nov: sömn 8,3 h, vilopuls 50, HRV 82 ms (balanserad).</div>}

      <Section title="🌙 Sömn" right={avg('sleepH') && <span className="chip">snitt {avg('sleepH')!.toFixed(1)} h</span>}>
        {data.some((x) => x.sömn) ? <Bars data={data} x="label" unit=" h" refY={{ y: s.readiness.minSleepH, label: `${s.readiness.minSleepH} h` }} bars={[{ key: 'sömn', name: 'Sömn', color: C.lav }]} /> : <Empty text="Ingen sömndata än." />}
      </Section>

      <Section title="❤️ Vilopuls" right={avg('restingHr') && <span className="chip">snitt {Math.round(avg('restingHr')!)}</span>}>
        {data.some((x) => x.vilopuls) ? (
          <TrendChart data={data} x="label" refY={s.readiness.rhrMode !== 'relative' ? { y: s.readiness.rhrAbsolute, label: `${s.readiness.rhrAbsolute}` } : undefined} lines={[{ key: 'vilopuls', name: 'Vilopuls', color: C.pink, dot: true }]} />
        ) : (
          <Empty text="Ingen vilopuls än." />
        )}
      </Section>

      <Section title="〰️ HRV" right={avg('hrv') && <span className="chip">snitt {Math.round(avg('hrv')!)} ms</span>}>
        {data.some((x) => x.hrv) ? <TrendChart data={data} x="label" unit=" ms" lines={[{ key: 'hrv', name: 'HRV', color: C.lav, dot: true }]} /> : <Empty text="Ingen HRV än." />}
        {rows.some((r) => r.hrvStatus && r.hrvStatus !== 'BALANCED') && (
          <p className="mt-1 text-sm">⚠️ Obalanserade dagar: {rows.filter((r) => r.hrvStatus && r.hrvStatus !== 'BALANCED' && r.hrvStatus !== 'NONE').map((r) => prettyDate(r.date)).join(', ')}</p>
        )}
      </Section>

      <Section title="⚡ Intensiva minuter">
        {data.some((x) => x.intensitet) ? <Bars data={data} x="label" unit=" min" bars={[{ key: 'intensitet', name: 'Intensitetsminuter', color: C.pink }]} /> : <Empty text="Inga intensitetsminuter än." />}
      </Section>
    </Page>
  );
}
