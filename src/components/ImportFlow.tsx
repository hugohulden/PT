import { useState } from 'react';
import { applyImport, extractJson, ImportError, normalizePayload, parseCsv, previewImport, restoreBackup, type ImportPayload, type ImportPreview } from '../lib/importer';
import { evaluateBadges } from '../lib/badges';
import { celebrate } from '../lib/fx';

/** Klistra in eller ladda upp → förhandsgranska → spara. */
export default function ImportFlow({ source, placeholder, onDone }: { source: 'claude' | 'json' | 'csv'; placeholder: string; onDone?: (msg: string) => void }) {
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [pre, setPre] = useState<{ p: ImportPayload; preview?: ImportPreview; raw: string; backup?: Record<string, unknown> } | null>(null);
  const [busy, setBusy] = useState(false);

  async function analyze(raw: string, isCsv = false) {
    setErr(null);
    setPre(null);
    try {
      if (isCsv || (!raw.trim().startsWith('{') && !raw.includes('```') && raw.includes(','))) {
        const p = parseCsv(raw);
        setPre({ p, raw, preview: await previewImport(p, raw) });
        return;
      }
      const json = extractJson(raw) as Record<string, unknown>;
      if (json.app === 'traningsapp') {
        setPre({ p: {}, raw, backup: json });
        return;
      }
      const p = normalizePayload(json);
      setPre({ p, raw, preview: await previewImport(p, raw) });
    } catch (e) {
      setErr(e instanceof ImportError ? e.message : `Kunde inte läsa: ${(e as Error).message}`);
    }
  }

  async function save() {
    if (!pre) return;
    setBusy(true);
    try {
      let msg: string;
      if (pre.backup) {
        const n = await restoreBackup(pre.backup);
        msg = `Backupen är återställd (${n} rader) ✨`;
      } else {
        const r = await applyImport(pre.p, { hash: pre.preview!.hash, source, label: `${source} ${new Date().toLocaleString('sv-SE')}` });
        msg = `Importerat! ${r.count} poster, ${r.matched} kopplade till planen ✨`;
      }
      const nb = await evaluateBadges();
      if (nb.length) celebrate('milestone');
      setPre(null);
      setText('');
      onDone?.(msg);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pv = pre?.preview;
  return (
    <div>
      <textarea className="field min-h-32 font-mono text-base" value={text} onChange={(e) => setText(e.target.value)} placeholder={placeholder} aria-label="Klistra in data" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <button className="btn btn-primary" onClick={() => analyze(text)} disabled={!text.trim()}>
          Granska
        </button>
        <label className="btn btn-ghost cursor-pointer">
          Välj fil…
          <input
            type="file"
            accept=".json,.csv,.txt,.md,application/json,text/csv,text/plain"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const t = await f.text();
              setText(t.length > 20000 ? '' : t);
              await analyze(t, f.name.toLowerCase().endsWith('.csv'));
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {err && (
        <p className="mt-2 rounded-xl bg-[#ffe1cc] p-3 text-sm text-[#7a3500] dark:bg-[#4a2610] dark:text-[#ffd2b0]" role="alert">
          {err}
        </p>
      )}
      {pre && (
        <div className="card-soft mt-3">
          <p className="mb-1 font-semibold">Förhandsgranskning</p>
          {pre.backup ? (
            <p className="text-sm">Backup från {String(pre.backup.exportedAt ?? '').slice(0, 10)}. Nyare ändringar i telefonen behålls.</p>
          ) : (
            <ul className="space-y-0.5 text-sm">
              {pv!.alreadyImported && <li>ℹ️ Exakt den här filen är redan importerad – inget dubbleras.</li>}
              {(pv!.activities.new > 0 || pv!.activities.updated > 0) && (
                <li>
                  🏃‍♀️ {pv!.activities.new} nya aktiviteter{pv!.activities.updated ? `, ${pv!.activities.updated} uppdateras` : ''}
                </li>
              )}
              {pv!.daily > 0 && <li>🌙 {pv!.daily} dagar med steg/sömn/puls</li>}
              {pv!.weighIns > 0 && <li>⚖️ {pv!.weighIns} invägningar</li>}
              {pv!.predictions > 0 && <li>🏁 loppprognos</li>}
              {(pv!.workouts.new > 0 || pv!.workouts.duplicate > 0) && (
                <li>
                  💪 {pv!.workouts.new} gympass{pv!.workouts.duplicate ? ` (${pv!.workouts.duplicate} finns redan och hoppas över)` : ''}
                </li>
              )}
              {pv!.beforeApp > 0 && <li>🕰️ {pv!.beforeApp} pass märks "före appen"</li>}
              {pv!.workouts.unknownExercises.length > 0 && <li>⚠️ Okända övningar hoppas över: {pv!.workouts.unknownExercises.join(', ')}</li>}
            </ul>
          )}
          <button className="btn btn-primary mt-3 w-full" onClick={save} disabled={busy}>
            {busy ? 'Sparar…' : 'Spara'}
          </button>
        </div>
      )}
    </div>
  );
}

export function CopyBox({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <button
        className="btn btn-primary w-full"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
          } catch {
            setCopied(false);
          }
        }}
      >
        {copied ? 'Kopierat ✓' : label}
      </button>
      <details className="mt-1">
        <summary className="text-soft min-h-11 cursor-pointer py-2 text-sm">Visa texten</summary>
        <pre className="card-soft max-h-64 overflow-auto whitespace-pre-wrap text-xs">{text}</pre>
      </details>
    </div>
  );
}
