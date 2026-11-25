import { exercise } from '../lib/exercises';
import { fmtDuration } from '../lib/dates';
import type { PlannedSession, StrengthItem } from '../lib/types';
import { HrBadge } from './ui';

export function itemTarget(i: StrengthItem) {
  const r = i.repMin === i.repMax ? `${i.repMin}` : `${i.repMin}–${i.repMax}`;
  if (i.role === 'warmup') return '5–8 min';
  if (i.role === 'test') return 'max';
  return `${i.sets} × ${r}${i.unit === 'seconds' ? ' s' : ''}${i.perSide ? ' per sida' : ''}`;
}

export default function SessionDetail({ s }: { s: PlannedSession }) {
  return (
    <div className="space-y-3">
      {s.adjustment && (
        <div className="card-soft text-sm">
          ✨ Justerat: {s.adjustment.reason}
        </div>
      )}
      {s.run && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <HrBadge hr={s.run.hr} big />
            {s.run.distanceText && <span className="chip">{s.run.distanceText}</span>}
            <span className="chip">≈ {s.run.estKm} km totalt</span>
          </div>
          <p>{s.run.description}</p>
          <ol className="space-y-2">
            {s.run.steps.map((st, i) => (
              <li key={i} className="card-soft flex items-center justify-between gap-2">
                <span>
                  {st.repeats && st.kind !== 'recovery' ? `${st.repeats} × ` : ''}
                  {st.label}
                  {st.durationSec && st.kind !== 'run' ? ` (${fmtDuration(st.durationSec)})` : ''}
                </span>
                {st.hr && <span className="text-soft text-sm">💗 {st.hr[0]}–{st.hr[1]}</span>}
              </li>
            ))}
          </ol>
        </>
      )}
      {s.strength && (
        <>
          <p className="text-soft text-sm">{s.strength.intensityNote}</p>
          <ol className="space-y-2">
            {s.strength.items.map((i, idx) => (
              <li key={idx} className="card-soft flex items-center justify-between gap-2">
                <span>
                  {exercise(i.exerciseId).name}
                  {i.note && <span className="text-soft block text-xs">{i.note}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold">{itemTarget(i)}</span>
              </li>
            ))}
          </ol>
        </>
      )}
      {s.swim && (
        <>
          <p>
            Förslag: ca <b>{s.swim.targetM} m</b>, 30–45 min. Du bestämmer själv 💙
          </p>
          <p className="card-soft">{s.swim.suggestion}</p>
          <p className="text-soft text-sm">Simpass skickas inte till Garmin – genomförd bassängsim synkas tillbaka automatiskt.</p>
        </>
      )}
      {s.kind === 'rest' && <p>Vilodag 🌙 Ta en promenad för stegmålet – det räknas som återhämtning.</p>}
    </div>
  );
}
