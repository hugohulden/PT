import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useToday } from '../hooks';
import { addDays } from '../lib/dates';
import { claudeSyncPrompt } from '../lib/importer';
import { cloudConfigured, getSession, getSyncState, onSyncState, sendCode, signOut, syncNow, verifyCode, type SyncState } from '../sync/cloud';
import { getIntervalsConfig, saveIntervalsConfig, syncIntervals, type IntervalsConfig, type IntervalsStatus } from '../sync/intervals';
import ImportFlow, { CopyBox } from '../components/ImportFlow';
import { Page, Section, Toast } from '../components/ui';

export function useSyncState() {
  const [s, setS] = useState<SyncState>(getSyncState());
  useEffect(() => {
    const off = onSyncState(setS);
    return () => {
      off();
    };
  }, []);
  return s;
}

const ago = (t?: number | string) => {
  if (!t) return 'aldrig';
  const ms = Date.now() - new Date(t).getTime();
  const min = Math.round(ms / 60000);
  if (min < 1) return 'nyss';
  if (min < 60) return `${min} min sedan`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h sedan` : new Date(t).toLocaleDateString('sv-SE');
};

export default function Sync() {
  const d = useToday();
  const [toast, setToast] = useState<string | null>(null);
  const [from, setFrom] = useState(addDays(d, -7));
  const lastImport = useLiveQuery(async () => (await db.imports.toArray()).sort((a, b) => b.at - a.at)[0], []);

  return (
    <Page title="Synk" back>
      <Toast msg={toast} onDone={() => setToast(null)} />

      <IntervalsSection onToast={setToast} />

      <Section title="💬 Synka via Claude (reservväg)">
        <p className="mb-2 text-sm">
          Om något saknas från Intervals.icu (t.ex. steg eller loppprognos) kan din Claude hämta det med Garmin-kopplingen. Kör prompten i <b>din egen</b> Claude-app – den hämtar från det Garmin-konto som är kopplat där.
        </p>
        <label className="mb-2 block">
          <span className="text-sm font-semibold">Hämta från och med</span>
          <input type="date" id="claude-from" className="field mt-1" value={from} max={d} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <button className="btn btn-ghost mb-2 w-full text-sm" onClick={() => setFrom('2026-10-19')}>
          Allt från V1 (19 okt)
        </button>
        <ol className="mb-3 space-y-1 text-sm">
          <li>1. Kopiera prompten och klistra in den i en ny chatt i Claude-appen.</li>
          <li>2. Kopiera Claudes svar (JSON-blocket), eller spara det som fil.</li>
          <li>3. Klistra in här nedanför → Granska → Spara.</li>
        </ol>
        <CopyBox text={claudeSyncPrompt(from, d)} label="📋 Kopiera prompten" />
        <div className="mt-3">
          <ImportFlow source="claude" placeholder="Klistra in Claudes svar här…" onDone={setToast} />
        </div>
        {lastImport && <p className="text-soft mt-2 text-xs">Senaste import: {lastImport.label}</p>}
      </Section>

      {cloudConfigured && <CloudSection onToast={setToast} />}
    </Page>
  );
}

function IntervalsSection({ onToast }: { onToast: (m: string) => void }) {
  const cfg = useLiveQuery(() => getIntervalsConfig(), []);
  const status = useLiveQuery(async () => ((await db.meta.get('intervalsStatus'))?.value as IntervalsStatus) ?? {}, []);
  const [form, setForm] = useState<IntervalsConfig>({ apiKey: '', athleteId: '0', proxy: '' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const connected = !!cfg?.apiKey && !editing;

  async function run(full = false) {
    setErr(null);
    setBusy(true);
    try {
      const st = await syncIntervals({ full });
      onToast(`Synkat ✨ ${st.message ?? ''}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section title="⌚ Klockan via Intervals.icu">
      <p className="mb-2 text-sm">Garmin → Intervals.icu → appen. Nya pass, sömn, vilopuls, HRV, vikt och steg hämtas automatiskt när du öppnar appen och kopplas till rätt pass i planen.</p>

      {connected ? (
        <>
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-soft">Status</dt>
            <dd>{status?.ok === false ? '⚠️ Fel' : '✅ Kopplad'}</dd>
            <dt className="text-soft">Senast synkad</dt>
            <dd>{busy ? 'synkar…' : ago(status?.lastSync)}</dd>
          </dl>
          {status?.message && <p className={`card-soft mt-2 text-sm ${status.ok === false ? 'text-[#9a4a00] dark:text-[#ffc38a]' : ''}`}>{status.message}</p>}
          <button className="btn btn-primary mt-3 w-full" onClick={() => run()} disabled={busy}>
            🔄 Synka nu
          </button>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button className="btn btn-ghost text-sm" onClick={() => run(true)} disabled={busy}>
              Hämta allt från V1
            </button>
            <button
              className="btn btn-ghost text-sm"
              onClick={() => {
                setForm({ apiKey: '', athleteId: cfg!.athleteId, proxy: cfg!.proxy ?? '' });
                setEditing(true);
              }}
            >
              Ändra nyckel
            </button>
          </div>
          <button
            className="btn btn-ghost mt-2 w-full text-sm"
            onClick={async () => {
              await saveIntervalsConfig(undefined);
              await db.meta.delete('intervalsStatus');
            }}
          >
            Koppla från
          </button>
        </>
      ) : (
        <>
          <ol className="mb-3 space-y-1.5 text-sm">
            <li>
              1. Skapa ett gratis konto på <b>intervals.icu</b> och koppla Garmin Connect (<i>Settings → Connections</i>). Kryssa i att aktiviteter och <b>wellness-data</b> ska laddas ner.
            </li>
            <li>
              2. Intervals.icu → <i>Settings → Developer Settings</i> → skapa en <b>API-nyckel</b>.
            </li>
            <li>3. Klistra in nyckeln här och tryck Spara och synka.</li>
          </ol>
          <label className="block">
            <span className="text-sm font-semibold">API-nyckel</span>
            <input
              id="icu-key"
              className="field mt-1 font-mono"
              type="password"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              value={form.apiKey}
              onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
            />
          </label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-sm font-semibold">Atlet-id</span>
              <input id="icu-athlete" className="field mt-1" autoCapitalize="none" value={form.athleteId} onChange={(e) => setForm({ ...form, athleteId: e.target.value })} />
              <span className="text-soft text-xs">0 = ditt konto</span>
            </label>
            <label className="block">
              <span className="text-sm font-semibold">Mellanserver (valfri)</span>
              <input id="icu-proxy" className="field mt-1" inputMode="url" autoCapitalize="none" placeholder="https://…workers.dev" value={form.proxy} onChange={(e) => setForm({ ...form, proxy: e.target.value })} />
              <span className="text-soft text-xs">Bara om direkt anrop blockeras</span>
            </label>
          </div>
          <button
            className="btn btn-primary mt-3 w-full"
            disabled={!form.apiKey.trim() || busy}
            onClick={async () => {
              await saveIntervalsConfig({ apiKey: form.apiKey.trim(), athleteId: form.athleteId.trim() || '0', proxy: form.proxy?.trim() || undefined });
              setEditing(false);
              await run(true);
            }}
          >
            {busy ? 'Synkar…' : 'Spara och synka'}
          </button>
          {editing && (
            <button className="btn btn-ghost mt-2 w-full" onClick={() => setEditing(false)}>
              Avbryt
            </button>
          )}
        </>
      )}
      {err && (
        <p className="mt-2 rounded-xl bg-[#ffe1cc] p-3 text-sm text-[#7a3500] dark:bg-[#4a2610] dark:text-[#ffd2b0]" role="alert">
          {err}
        </p>
      )}
      <p className="text-soft mt-2 text-xs">Nyckeln sparas bara i den här telefonen och följer inte med i backup eller molnsynk.</p>
    </Section>
  );
}

function CloudSection({ onToast }: { onToast: (m: string) => void }) {
  const st = useSyncState();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const outbox = useLiveQuery(() => db.outbox.count(), []) ?? 0;

  useEffect(() => {
    void getSession().then((s) => setUser(s?.user.email ?? null));
  }, [st.lastSync]);

  return (
    <Section title="☁️ Molnbackup">
      {!user ? (
        <div className="space-y-2">
          <p className="text-sm">Logga in en gång så sparas allt i molnet och försvinner aldrig, även om telefonen rensar appen.</p>
          <input className="field" id="cloud-email" type="email" inputMode="email" autoComplete="email" placeholder="din@epost.se" value={email} onChange={(e) => setEmail(e.target.value)} />
          {sent && <input className="field text-center text-2xl tracking-[0.4em]" id="cloud-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Kod från e-posten" />}
          <button
            className="btn btn-primary w-full"
            onClick={async () => {
              setErr(null);
              try {
                if (!sent) {
                  await sendCode(email.trim());
                  setSent(true);
                  onToast('Kolla mejlen – skriv in koden 💌');
                } else {
                  await verifyCode(email.trim(), code);
                  onToast('Inloggad! 💖');
                  setUser(email.trim());
                }
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          >
            {sent ? 'Logga in' : 'Skicka kod'}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <dl className="grid grid-cols-2 gap-y-1 text-sm">
            <dt className="text-soft">Inloggad</dt>
            <dd>{user}</dd>
            <dt className="text-soft">Senast sparad</dt>
            <dd>{st.running ? 'synkar…' : ago(st.lastSync)}</dd>
            <dt className="text-soft">Väntar på uppladdning</dt>
            <dd>{outbox} ändringar</dd>
          </dl>
          {st.lastError && <p className="text-sm text-[#9a4a00] dark:text-[#ffc38a]">⚠️ {st.lastError}</p>}
          <button className="btn btn-ghost w-full" onClick={() => syncNow().then(() => onToast('Sparat i molnet ✨'))} disabled={st.running}>
            Spara nu
          </button>
          <button className="btn btn-ghost w-full" onClick={() => signOut().then(() => setUser(null))}>
            Logga ut
          </button>
        </div>
      )}
      {err && (
        <p className="mt-2 text-sm text-[#9a4a00] dark:text-[#ffc38a]" role="alert">
          {err}
        </p>
      )}
    </Section>
  );
}
