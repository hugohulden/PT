import { prettyDate } from '../lib/dates';
import type { HistoryWeek } from '../lib/history';
import { capVerdict } from '../lib/rules';
import type { Settings } from '../lib/types';

/** Sammanfattning av en vecka före appen (V1–V5). */
export default function HistoryCard({ h, s }: { h: HistoryWeek; s: Settings }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">
          V{h.week} <span className="text-soft text-sm font-semibold">{prettyDate(h.from)} – {prettyDate(h.to)}</span>
        </h2>
        <span className="chip">före appen</span>
      </div>
      <p className="font-display mt-1 text-2xl font-bold">
        {h.approx ? 'ca ' : ''}
        {h.runKm.toLocaleString('sv-SE')} km
      </p>
      <p className="text-sm">{h.comment}</p>
      {h.runs.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {h.runs.map((r, i) => {
            const kind = /lång/i.test(r.label) ? 'long' : /lugnt/i.test(r.label) ? 'easy' : r.avgHr && r.avgHr > 165 ? 'long' : 'easy';
            const v = capVerdict(kind, r.avgHr, s);
            return (
              <li key={i} className="card-soft text-sm">
                <span className="font-semibold">
                  {r.date ? `${prettyDate(r.date)} · ` : ''}
                  {r.label}: {r.km.toLocaleString('sv-SE')} km
                </span>
                {r.avgHr && <span> · snittpuls {r.avgHr}</span>}
                {r.pace && <span> · {r.pace}</span>}
                {v && (
                  <span className="block">
                    {v.emoji} {v.ok ? 'Inom pulstaket' : `Över taket (${kind === 'long' ? s.hr.long[1] : s.hr.easy[1]})`}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {h.other.length > 0 && <p className="text-soft mt-2 text-sm">Även: {h.other.join(' · ')}</p>}
      <p className="text-soft mt-2 text-xs">Enskilda pass, steg, sömn och HRV fylls på när Garmin-historiken hämtas.</p>
    </section>
  );
}
