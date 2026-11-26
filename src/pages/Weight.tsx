import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, uid } from '../db/db';
import { useToday } from '../hooks';
import { prettyDate } from '../lib/dates';
import { C, Empty, TrendChart, movingAvg } from '../components/Charts';
import { Page, Section, Toast } from '../components/ui';
import { WeighSheet } from './Today';

export default function Weight() {
  const d = useToday();
  const weigh = useLiveQuery(() => db.weighIns.filter((w) => !w.deleted).toArray(), []) ?? [];
  const meas = useLiveQuery(() => db.measurements.filter((m) => !m.deleted).toArray(), []) ?? [];
  const photos = useLiveQuery(() => db.photos.orderBy('date').reverse().toArray(), []) ?? [];
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [m, setM] = useState({ waist: '', hip: '', thigh: '' });

  const data = movingAvg(weigh.map((x) => ({ date: x.date, v: x.kg }))).map((p) => ({ ...p, label: prettyDate(p.date) }));
  const measData = [...meas].sort((a, b) => a.date.localeCompare(b.date)).map((x) => ({ label: prettyDate(x.date), midja: x.waistCm, höft: x.hipCm, lår: x.thighCm }));
  const first = meas.length ? [...meas].sort((a, b) => a.date.localeCompare(b.date))[0] : undefined;
  const last = meas.length ? [...meas].sort((a, b) => b.date.localeCompare(a.date))[0] : undefined;

  async function saveMeas() {
    const n = (v: string) => (v ? parseFloat(v.replace(',', '.')) : undefined);
    if (!m.waist && !m.hip && !m.thigh) return;
    await db.measurements.put({ id: uid(), date: d, waistCm: n(m.waist), hipCm: n(m.hip), thighCm: n(m.thigh), updatedAt: Date.now() });
    setM({ waist: '', hip: '', thigh: '' });
    setToast('Måtten är sparade 📏');
  }

  return (
    <Page title="Vikt & mått" back>
      <Toast msg={toast} onDone={() => setToast(null)} />
      <Section title="Vikt" right={<button className="btn btn-primary" onClick={() => setOpen(true)}>+ Väg in</button>}>
        {data.length ? (
          <TrendChart data={data} x="label" unit=" kg" lines={[{ key: 'v', name: 'Dagsvikt', color: C.rose, faded: true, dot: true }, { key: 'avg', name: '7-dagars', color: C.pink }]} />
        ) : (
          <Empty text="Första invägningen blir ditt startvärde." />
        )}
        <p className="text-soft text-sm">Vikten svänger naturligt 1–2 kg från dag till dag. När du bygger muskler och tappar fett kan vikten stå still medan måtten minskar – därför är måtten minst lika viktiga 💖</p>
        {weigh.length > 0 && (
          <details className="mt-2" open>
            <summary className="text-accent min-h-11 cursor-pointer py-2 font-semibold">Alla invägningar</summary>
            <ul className="space-y-1">
              {[...weigh].sort((a, b) => b.date.localeCompare(a.date)).map((w) => (
                <li key={w.id} className="flex items-center justify-between">
                  <span>
                    {prettyDate(w.date)} · {w.kg.toFixed(1)} kg <span className="text-soft text-xs">{w.source === 'garmin' ? 'Garmin' : ''}</span>
                  </span>
                  <button className="btn btn-ghost px-3 text-sm" onClick={() => db.weighIns.update(w.id, { deleted: true, updatedAt: Date.now() })} aria-label={`Ta bort ${w.kg} kg`}>
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </Section>

      <Section title="Mått 📏">
        {first && last && first.id !== last.id && (
          <div className="mb-2 flex flex-wrap gap-2">
            {delta('Midja', first.waistCm, last.waistCm)}
            {delta('Höft', first.hipCm, last.hipCm)}
            {delta('Lår', first.thighCm, last.thighCm)}
          </div>
        )}
        {measData.length > 1 ? (
          <TrendChart data={measData} x="label" unit=" cm" lines={[{ key: 'midja', name: 'Midja', color: C.pink, dot: true }, { key: 'höft', name: 'Höft', color: C.lav, dot: true }, { key: 'lår', name: 'Lår', color: C.gold, dot: true }]} />
        ) : (
          <Empty text="Mät gärna en gång i månaden, samma tid på dagen." />
        )}
        <div className="mt-2 grid grid-cols-3 gap-2">
          {(['waist', 'hip', 'thigh'] as const).map((k) => (
            <label key={k}>
              <span className="text-sm font-semibold">{k === 'waist' ? 'Midja' : k === 'hip' ? 'Höft' : 'Lår'} (cm)</span>
              <input className="field mt-1" inputMode="decimal" value={m[k]} onChange={(e) => setM({ ...m, [k]: e.target.value })} placeholder={String((last?.[k === 'waist' ? 'waistCm' : k === 'hip' ? 'hipCm' : 'thighCm'] ?? '') || '–')} />
            </label>
          ))}
        </div>
        <button className="btn btn-primary mt-3 w-full" onClick={saveMeas}>
          Spara mått
        </button>
      </Section>

      <Section title="Månadsbilder 📸">
        <p className="text-soft mb-2 text-sm">Valfritt. Bilderna sparas bara i din telefon – de synkas aldrig någonstans.</p>
        <label className="btn btn-outline w-full cursor-pointer">
          + Lägg till bild
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              await db.photos.put({ id: uid(), date: d, blob: f });
              e.target.value = '';
            }}
          />
        </label>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((p) => (
            <Photo key={p.id} blob={p.blob} date={p.date} onDelete={() => db.photos.delete(p.id)} />
          ))}
        </div>
      </Section>

      <WeighSheet open={open} onClose={() => setOpen(false)} last={weigh.length ? [...weigh].sort((a, b) => b.date.localeCompare(a.date))[0].kg : undefined} date={d} onSaved={() => setToast('Sparat 💖')} />
    </Page>
  );
}

function delta(label: string, a?: number, b?: number) {
  if (a == null || b == null) return null;
  const dlt = b - a;
  return (
    <span className="chip">
      {label} {dlt > 0 ? '+' : ''}
      {dlt.toFixed(1)} cm
    </span>
  );
}

function Photo({ blob, date, onDelete }: { blob: Blob; date: string; onDelete: () => void }) {
  const [url, setUrl] = useState<string>();
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <figure className="relative">
      {url && <img src={url} alt={`Bild ${prettyDate(date)}`} className="aspect-[3/4] w-full rounded-xl object-cover" />}
      <figcaption className="text-soft text-center text-xs">{prettyDate(date)}</figcaption>
      <button className="absolute right-1 top-1 h-8 w-8 rounded-full bg-black/50 text-white" onClick={() => (confirm ? onDelete() : setConfirm(true))} aria-label="Ta bort bild">
        {confirm ? '✓' : '✕'}
      </button>
    </figure>
  );
}
