import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { checkAppUpdate, checkRemoteConfig, type RemoteConfig } from '../lib/remoteConfig';
import { syncIntervals, getIntervalsConfig } from '../sync/intervals';
import { Sheet } from './ui';

export const APP_VERSION = __APP_VERSION__;
const BUILD = new Date(__BUILD_DATE__);

export function versionText() {
  return `Version ${APP_VERSION} · ${BUILD.toLocaleDateString('sv-SE', { day: 'numeric', month: 'short' })} ${BUILD.toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })}`;
}

/** Kort med "Sök efter uppdateringar": ny appversion, Hugos inställningar och ny klockdata. */
export default function UpdateCheck({ compact }: { compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const remote = useLiveQuery(async () => (await db.meta.get('remoteConfig'))?.value as RemoteConfig | undefined, []);

  async function check() {
    setBusy(true);
    setResult(null);
    try {
      const [appNew, cfg] = await Promise.all([checkAppUpdate().catch(() => false), checkRemoteConfig()]);
      if ((await getIntervalsConfig())?.apiKey) await syncIntervals().catch(() => undefined);
      const parts: string[] = [];
      if (cfg.changed.length) parts.push(`Uppdaterat: ${cfg.changed.join(', ')}.`);
      if (cfg.message) parts.push(cfg.message);
      if (appNew) parts.push('Ny version hittad – appen startar om om en stund ✨');
      setResult(parts.length ? parts.join(' ') : 'Du har senaste versionen och inställningarna 💖');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={compact ? '' : 'card'}>
      {!compact && <h2 className="mb-1 text-lg font-semibold">Uppdateringar</h2>}
      <p className="text-soft text-sm">
        {versionText()}
        {remote ? ` · inställningar v${remote.version}` : ''}
      </p>
      <button className="btn btn-primary mt-2 w-full" onClick={check} disabled={busy}>
        {busy ? 'Söker…' : '🔄 Sök efter uppdateringar'}
      </button>
      {result && (
        <p className="card-soft mt-2 text-sm" role="status">
          {result}
        </p>
      )}
    </div>
  );
}

/** Visas en gång när Hugo har ändrat något i config.json. */
export function NewsSheet({ news, onClose }: { news: { changed: string[]; message?: string } | null; onClose: () => void }) {
  return (
    <Sheet open={!!news} onClose={onClose} title="Nytt i din plan 💖">
      {news?.message && <p className="mb-2">{news.message}</p>}
      {news && news.changed.length > 0 && (
        <p className="card-soft text-sm">
          Uppdaterat: <b>{news.changed.join(', ')}</b>. Pass du redan gjort, flyttat eller ändrat ligger kvar som de är.
        </p>
      )}
      <button className="btn btn-primary mt-4 w-full" onClick={onClose}>
        Toppen!
      </button>
    </Sheet>
  );
}
