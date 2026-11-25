import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useToday } from '../hooks';
import { addDays } from '../lib/dates';
import { claudeSyncPrompt } from '../lib/importer';
import { cloudConfigured, getSession, getSyncState, onSyncState, sendCode, signOut, syncNow, triggerGarminSync, verifyCode, type SyncState } from '../sync/cloud';
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
  const st = useSyncState();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [user, setUser] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [from, setFrom] = useState(addDays(d, -7));
  const outbox = useLiveQuery(() => db.outbox.count(), []) ?? 0;
  const lastImport = useLiveQuery(async () => (await db.imports.toArray()).sort((a, b) => b.at - a.at)[0], []);

  useEffect(() => {
    void getSession().then((s) => setUser(s?.user.email ?? null));
  }, [st.lastSync]);

  async function syncAll() {
    setErr(null);
    const triggered = await triggerGarminSync();
    await syncNow();
    setToast(triggered ? 'Hämtar från Garmin – nya pass dyker upp om någon minut ☁️' : 'Synkat ✨');
    // Hämta igen när jobbet hunnit köra
    if (triggered) setTimeout(() => void syncNow(), 90_000);
  }

  return (
    <Page title="Synk" back>
      <Toast msg={toast} onDone={() => setToast(null)} />

      <Section title="☁️ Garmin → appen">
        {!cloudConfigured ? (
          <p className="text-sm">Den automatiska synken är inte påslagen än. Tills dess: använd <b>Synka via Claude</b> här nedanför – det fungerar redan nu.</p>
        ) : !user ? (
          <div className="space-y-2">
            <p className="text-sm">Logga in en gång så synkas allt automatiskt och försvinner aldrig, även om telefonen rensar appen.</p>
            <input className="field" type="email" inputMode="email" autoComplete="email" placeholder="din@epost.se" value={email} onChange={(e) => setEmail(e.target.value)} />
            {sent && <input className="field text-center text-2xl tracking-[0.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="••••••" value={code} onChange={(e) => setCode(e.target.value)} aria-label="Kod från e-posten" />}
            <button
              className="btn btn-primary w-full"
              onClick={async () => {
                setErr(null);
                try {
                  if (!sent) {
                    await sendCode(email.trim());
                    setSent(true);
                    setToast('Kolla mejlen – skriv in koden 💌');
                  } else {
                    await verifyCode(email.trim(), code);
                    setToast('Inloggad! 💖');
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
              <dt className="text-soft">Senast synkad</dt>
              <dd>{st.running ? 'synkar…' : ago(st.lastSync)}</dd>
              <dt className="text-soft">Senast från Garmin</dt>
              <dd>
                {st.garminOk === false ? '⚠️ ' : ''}
                {ago(st.garminLastSuccess)}
              </dd>
              <dt className="text-soft">Väntar på uppladdning</dt>
              <dd>{outbox} ändringar</dd>
            </dl>
            {st.garminMessage && <p className="card-soft text-sm">{st.garminMessage}</p>}
            {st.lastError && <p className="text-sm text-[#9a4a00] dark:text-[#ffc38a]">⚠️ {st.lastError}</p>}
            <button className="btn btn-primary w-full" onClick={syncAll} disabled={st.running}>
              🔄 Synka nu
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

      <Section title="💬 Synka via Claude (reservväg)">
        <p className="mb-2 text-sm">Fungerar alltid – även om den automatiska synken krånglar. Din Claude hämtar datan med Garmin-kopplingen.</p>
        <label className="mb-2 block">
          <span className="text-sm font-semibold">Hämta från och med</span>
          <input type="date" className="field mt-1" value={from} max={d} onChange={(e) => setFrom(e.target.value)} />
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
    </Page>
  );
}
