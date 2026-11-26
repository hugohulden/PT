import { useState } from 'react';
import { db, SYNCED_TABLES } from '../db/db';
import { saveSettings } from '../db/repo';
import { useSettings } from '../hooks';
import type { HrRange, Settings } from '../lib/types';
import { Page, Section, Toast } from '../components/ui';
import UpdateCheck from '../components/UpdateCheck';

export default function SettingsPage() {
  const s = useSettings();
  const [toast, setToast] = useState<string | null>(null);
  const save = async (p: Partial<Settings>, msg = 'Sparat ✨') => {
    await saveSettings(p);
    setToast(msg);
  };

  return (
    <Page title="Inställningar" back>
      <Toast msg={toast} onDone={() => setToast(null)} />

      <UpdateCheck />

      <Section title="Om dig">
        <Field label="Namn">
          <input className="field" defaultValue={s.name} onBlur={(e) => e.target.value && save({ name: e.target.value })} />
        </Field>
      </Section>

      <Section title="Utseende">
        <div className="grid grid-cols-3 gap-2">
          {(['auto', 'light', 'dark'] as const).map((t) => (
            <button key={t} className={`btn ${s.theme === t ? 'btn-primary' : 'btn-ghost'}`} onClick={() => save({ theme: t })}>
              {t === 'auto' ? 'Auto' : t === 'light' ? 'Ljust' : 'Mörkt'}
            </button>
          ))}
        </div>
        <Toggle label="Ljud när vilan är slut" on={s.soundOn} onChange={(v) => save({ soundOn: v })} />
      </Section>

      <Section title="Datum och plan">
        <Field label="Måndag i vecka 1">
          <input type="date" className="field" defaultValue={s.week1Start} onBlur={(e) => e.target.value !== s.week1Start && save({ week1Start: e.target.value }, 'Planen är uppdaterad')} />
        </Field>
        <Field label={`Loppdatum (${s.raceName})`}>
          <input type="date" className="field" defaultValue={s.raceDate} onBlur={(e) => e.target.value !== s.raceDate && save({ raceDate: e.target.value })} />
        </Field>
        <p className="text-soft text-sm">Klara, flyttade och ändrade pass behålls när planen räknas om.</p>
      </Section>

      <Section title="Pulstak 💗">
        <HrField label="Lugn löpning" v={s.hr.easy} onSave={(v) => save({ hr: { ...s.hr, easy: v } }, 'Pulstak sparat')} />
        <HrField label="Långpass" v={s.hr.long} onSave={(v) => save({ hr: { ...s.hr, long: v } }, 'Pulstak sparat')} />
        <HrField label="Intervaller och tempo" v={s.hr.quality} onSave={(v) => save({ hr: { ...s.hr, quality: v } }, 'Pulstak sparat')} />
      </Section>

      <Section title="Dagsform">
        <Field label="Korta passet om sömnen är under (h)">
          <NumberInput v={s.readiness.minSleepH} step={0.5} onSave={(v) => save({ readiness: { ...s.readiness, minSleepH: v } })} />
        </Field>
        <Field label="Vilopuls – när ska vila föreslås?">
          <select className="field" value={s.readiness.rhrMode} onChange={(e) => save({ readiness: { ...s.readiness, rhrMode: e.target.value as Settings['readiness']['rhrMode'] } })}>
            <option value="absolute">Fast gräns ({s.readiness.rhrAbsolute} eller högre)</option>
            <option value="relative">{s.readiness.rhrAboveAvg} slag över mitt 7-dagarssnitt</option>
            <option value="either">Något av dem</option>
          </select>
        </Field>
        <Field label="Fast gräns för vilopuls">
          <NumberInput v={s.readiness.rhrAbsolute} step={1} onSave={(v) => save({ readiness: { ...s.readiness, rhrAbsolute: v } })} />
        </Field>
        <Field label="Slag över snittet">
          <NumberInput v={s.readiness.rhrAboveAvg} step={1} onSave={(v) => save({ readiness: { ...s.readiness, rhrAboveAvg: v } })} />
        </Field>
      </Section>

      <Section title="Gym">
        <Field label="Standardvila mellan set (sekunder)">
          <NumberInput v={s.restSeconds} step={15} onSave={(v) => save({ restSeconds: v })} />
        </Field>
      </Section>

      <Section title="Steg">
        <Field label="Dagsmål">
          <NumberInput v={s.steps.goal} step={500} onSave={(v) => save({ steps: { ...s.steps, goal: v } })} />
        </Field>
        <Field label="Guldnivå">
          <NumberInput v={s.steps.bonus} step={500} onSave={(v) => save({ steps: { ...s.steps, bonus: v } })} />
        </Field>
      </Section>

      <Section title="Egna peppcitat">
        <QuoteEditor quotes={s.customQuotes} onSave={(q) => save({ customQuotes: q })} />
      </Section>

      <ResetSection />

      <Section title="Backup">
        <p className="text-soft mb-2 text-sm">Allt sparas i telefonen och synkas till molnet när inloggning är på. Exportera ändå en backup ibland 💾</p>
        <button className="btn btn-primary w-full" onClick={exportBackup}>
          Exportera backup (JSON)
        </button>
      </Section>
    </Page>
  );
}

async function exportBackup() {
  const data: Record<string, unknown> = { app: 'traningsapp', version: 1, exportedAt: new Date().toISOString() };
  for (const t of SYNCED_TABLES) data[t] = await db.table(t).toArray();
  const file = new File([JSON.stringify(data, null, 2)], `traning-backup-${new Date().toISOString().slice(0, 10)}.json`, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Träningsbackup' });
      return;
    } catch {
      /* avbrutet – fall tillbaka till nedladdning */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = file.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="mb-3 block">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

function NumberInput({ v, step, onSave }: { v: number; step: number; onSave: (v: number) => void }) {
  return (
    <input
      className="field"
      inputMode="decimal"
      step={step}
      defaultValue={String(v).replace('.', ',')}
      onBlur={(e) => {
        const n = parseFloat(e.target.value.replace(',', '.'));
        if (Number.isFinite(n) && n !== v) onSave(n);
      }}
    />
  );
}

function HrField({ label, v, onSave }: { label: string; v: HrRange; onSave: (v: HrRange) => void }) {
  const [lo, setLo] = useState(String(v[0]));
  const [hi, setHi] = useState(String(v[1]));
  const commit = () => {
    const a = parseInt(lo, 10);
    const b = parseInt(hi, 10);
    if (a > 60 && b > a && b < 210 && (a !== v[0] || b !== v[1])) onSave([a, b]);
  };
  return (
    <div className="mb-3">
      <span className="mb-1 block text-sm font-semibold">{label}</span>
      <div className="flex items-center gap-2">
        <input className="field text-center" inputMode="numeric" value={lo} onChange={(e) => setLo(e.target.value)} onBlur={commit} aria-label={`${label} lägsta puls`} />
        <span>–</span>
        <input className="field text-center" inputMode="numeric" value={hi} onChange={(e) => setHi(e.target.value)} onBlur={commit} aria-label={`${label} högsta puls`} />
      </div>
    </div>
  );
}

function Toggle({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button className="mt-3 flex min-h-11 w-full items-center justify-between" role="switch" aria-checked={on} onClick={() => onChange(!on)}>
      <span className="font-semibold">{label}</span>
      <span className={`relative h-7 w-12 rounded-full transition ${on ? 'bg-pink-strong' : 'bg-surface-2'}`}>
        <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition ${on ? 'left-[22px]' : 'left-0.5'}`} />
      </span>
    </button>
  );
}

function QuoteEditor({ quotes, onSave }: { quotes: string[]; onSave: (q: string[]) => void }) {
  const [text, setText] = useState('');
  return (
    <div>
      <ul className="mb-2 space-y-1">
        {quotes.map((q, i) => (
          <li key={i} className="card-soft flex items-center gap-2">
            <span className="flex-1">{q}</span>
            <button className="btn btn-ghost px-3" aria-label="Ta bort citat" onClick={() => onSave(quotes.filter((_, j) => j !== i))}>
              ✕
            </button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="field" value={text} onChange={(e) => setText(e.target.value)} placeholder="Skriv ett eget citat…" />
        <button
          className="btn btn-primary"
          onClick={() => {
            if (text.trim()) onSave([...quotes, text.trim()]);
            setText('');
          }}
        >
          Lägg till
        </button>
      </div>
    </div>
  );
}

function ResetSection() {
  const [step, setStep] = useState(0);
  return (
    <Section title="Börja om">
      <p className="text-soft mb-2 text-sm">
        Raderar all data i den här webbläsaren (pass, vikter, importer, inställningar) och skapar planen på nytt. Bra om du har testat appen eller importerat fel persons data. Påverkar inte andra telefoner.
      </p>
      {step === 0 && (
        <button className="btn btn-outline w-full" onClick={() => setStep(1)}>
          Radera all data här…
        </button>
      )}
      {step === 1 && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost" onClick={() => setStep(0)}>
            Avbryt
          </button>
          <button
            className="btn bg-[#9a1b1b] text-white"
            onClick={async () => {
              await db.delete();
              location.reload();
            }}
          >
            Ja, radera allt
          </button>
        </div>
      )}
    </Section>
  );
}
