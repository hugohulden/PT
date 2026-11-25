import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { exercise } from '../lib/exercises';
import { prettyDate } from '../lib/dates';
import { Page, Section } from '../components/ui';

// Grafer (vikttrend, styrka, löpvolym, pulstak, steg m.m.) byggs i steg 5.
export default function Progress() {
  const prs = useLiveQuery(() => db.prs.orderBy('date').reverse().toArray(), []) ?? [];
  return (
    <Page title="Framsteg">
      <Section title="🏆 Personliga rekord">
        {prs.length === 0 && <p className="text-soft">Dina rekord dyker upp här när du loggar pass 💪</p>}
        <ul className="space-y-1">
          {prs.map((p) => (
            <li key={p.id} className="flex justify-between gap-2">
              <span>{exercise(p.exerciseId).name}</span>
              <span className="font-semibold">
                {p.kind === 'longestHold' ? `${p.value} s` : p.kind === 'mostReps' ? `${p.value} reps${p.weightKg ? ` @ ${p.weightKg} kg` : ''}` : `${p.value} kg`}
                <span className="text-soft ml-2 text-xs">{prettyDate(p.date)}</span>
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <div className="card text-soft">Grafer över vikt, styrka, löpning, pulstak och steg kommer i nästa steg ✨</div>
    </Page>
  );
}
