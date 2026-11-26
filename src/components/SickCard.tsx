import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { addDays, diffDays, prettyDate } from '../lib/dates';
import { cancelIllness, easeDays, endIllness, startIllness } from '../lib/illness';
import { celebrate } from '../lib/fx';
import type { Illness } from '../lib/types';
import { Sheet } from './ui';

const ADVICE: Record<Illness['level'], string> = {
  mild: 'Förkyld utan feber: vila är bäst. En lugn promenad går bra om du känner dig pigg – men ingen löpning eller gym förrän du är frisk.',
  fever: 'Feber, halsont, hosta eller ont i kroppen: ingen träning alls, inte ens lätt. Vila, drick och sov. Träning med feber kan vara farligt för hjärtat.',
};

/** Kort på startsidan: "Jag är sjuk" / "Krya på dig". */
export default function SickCard({ onToast }: { onToast: (m: string) => void }) {
  const s = useSettings();
  const d = useToday();
  const ill = useLiveQuery(async () => (await db.illness.toArray()).find((i) => !i.to && !i.deleted) ?? null, []);
  const dirty = useLiveQuery(() => db.sessions.filter((x) => !!x.garminDirty && !!x.garminExported).count(), []) ?? 0;
  const [open, setOpen] = useState(false);
  const [recover, setRecover] = useState(false);
  const [level, setLevel] = useState<Illness['level']>('mild');
  const [from, setFrom] = useState(d);

  if (ill === undefined) return null;

  if (ill) {
    const day = diffDays(d, ill.from) + 1;
    const n = easeDays(day - 1 || 1, ill.level);
    return (
      <section className="card" aria-labelledby="sjuk">
        <div className="flex items-start gap-3">
          <span className="text-4xl" aria-hidden>
            🤒
          </span>
          <div className="flex-1">
            <h2 id="sjuk" className="text-xl font-bold">
              Krya på dig, {s.name}! 💖
            </h2>
            <p className="text-soft text-sm">
              Sjuk sedan {prettyDate(ill.from)} · dag {day}
            </p>
          </div>
        </div>
        <p className="mt-2 text-sm">{ADVICE[ill.level]}</p>
        <p className="card-soft mt-2 text-sm">Alla pass är pausade tills du är frisk. Inget behöver tas igen – planen fortsätter där den är när du kommer tillbaka.</p>
        {dirty > 0 && (
          <Link to="/garmin" className="btn btn-outline mt-2 w-full">
            ⌚ Ta bort pausade pass från klockan
          </Link>
        )}
        <button className="btn btn-primary mt-3 w-full" onClick={() => setRecover(true)}>
          Jag är frisk igen 💪
        </button>
        <button
          className="text-soft mt-1 min-h-11 w-full text-sm underline"
          onClick={async () => {
            await cancelIllness();
            onToast('Sjukanmälan ångrad – passen är tillbaka');
          }}
        >
          Tryckte fel – ångra
        </button>

        <Sheet open={recover} onClose={() => setRecover(false)} title="Välkommen tillbaka! 🌸">
          <p className="mb-3">Kroppen behöver några dagar på sig efter sjukdom. Kommer febern eller tröttheten tillbaka – vila en dag till.</p>
          <button
            className="btn btn-primary w-full"
            onClick={async () => {
              const r = await endIllness({ ease: true });
              setRecover(false);
              celebrate('hearts');
              onToast(r.eased ? `Skönt att du är frisk! ${r.eased} pass de närmaste dagarna är lättare ✨` : 'Skönt att du är frisk! 💖');
            }}
          >
            Lugn återgång ({n} dagar lättare) – rekommenderas
          </button>
          <p className="text-soft mt-1 mb-3 text-xs">Inga intervaller, kortare löppass och färre set på gymmet. Du kan ångra per pass.</p>
          <button
            className="btn btn-ghost w-full"
            onClick={async () => {
              await endIllness({ ease: false });
              setRecover(false);
              onToast('Skönt att du är frisk! Planen kör som vanligt 💖');
            }}
          >
            Kör som vanligt
          </button>
        </Sheet>
      </section>
    );
  }

  return (
    <>
      <button className="btn btn-ghost w-full" onClick={() => (setFrom(d), setOpen(true))}>
        🤒 Jag är sjuk
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Hur mår du?">
        <div className="space-y-2" role="radiogroup" aria-label="Hur sjuk">
          {(
            [
              ['mild', '🤧 Förkyld, utan feber', 'Snuva eller lite ont i halsen'],
              ['fever', '🤒 Feber eller sjuk i kroppen', 'Feber, hosta, ont i kroppen, magsjuk'],
            ] as const
          ).map(([k, t, sub]) => (
            <button key={k} role="radio" aria-checked={level === k} className={`card-soft block w-full text-left ${level === k ? 'ring-2 ring-pink' : ''}`} onClick={() => setLevel(k)}>
              <span className="block font-semibold">{t}</span>
              <span className="text-soft text-sm">{sub}</span>
            </button>
          ))}
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-semibold">Sjuk sedan</span>
          <input type="date" id="sick-from" className="field mt-1" value={from} min={addDays(d, -14)} max={d} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <p className="card-soft mt-3 text-sm">{ADVICE[level]}</p>
        <button
          className="btn btn-primary mt-3 w-full"
          onClick={async () => {
            const n = await startIllness(from, level);
            setOpen(false);
            onToast(n ? `Vila nu 💖 ${n} pass är pausade.` : 'Vila nu 💖 Passen pausas tills du är frisk.');
          }}
        >
          Pausa träningen
        </button>
      </Sheet>
    </>
  );
}
