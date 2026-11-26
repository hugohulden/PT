import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js';
import { db, SYNCED_TABLES, withoutOutbox, type SyncedTable } from '../db/db';

// Valfri molnbackup. Offline först: allt skrivs lokalt (IndexedDB). När hon är
// inloggad skickas ändringar (utkorgen) till Supabase och nya rader hämtas hem,
// så att datan finns kvar även om iOS rensar appens lagring eller hon byter telefon.

const URL_ = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const cloudConfigured = !!(URL_ && KEY);
export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(URL_!, KEY!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } })
  : null;

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/** Skicka en 6-siffrig kod till e-posten (fungerar i hemskärms-appen, till skillnad från länkar). */
export async function sendCode(email: string) {
  if (!supabase) throw new Error('Molnet är inte konfigurerat.');
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) throw new Error(error.message.includes('Signups') ? 'Den e-postadressen har inget konto än.' : error.message);
}

export async function verifyCode(email: string, token: string) {
  if (!supabase) throw new Error('Molnet är inte konfigurerat.');
  const { error } = await supabase.auth.verifyOtp({ email, token: token.trim(), type: 'email' });
  if (error) throw new Error('Koden stämmer inte eller har gått ut. Be om en ny.');
  await syncNow();
}

export async function signOut() {
  await supabase?.auth.signOut();
}

// ---------------------------------------------------------------------------

const meta = {
  async get<T>(key: string): Promise<T | undefined> {
    return (await db.meta.get(key))?.value as T | undefined;
  },
  async set(key: string, value: unknown) {
    await db.meta.put({ key, value });
  },
};

export interface SyncState {
  running: boolean;
  lastSync?: number;
  lastError?: string;
}

let state: SyncState = { running: false };
const listeners = new Set<(s: SyncState) => void>();
const emit = (patch: Partial<SyncState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
};
export const getSyncState = () => state;
export function onSyncState(fn: (s: SyncState) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function pushOutbox(userId: string) {
  const items = await db.outbox.toArray();
  if (!items.length) return;
  const uniq = new Map<string, { table: SyncedTable; key: string }>();
  for (const i of items) uniq.set(`${i.table}|${i.key}`, { table: i.table, key: i.key });
  const rows = [];
  for (const { table, key } of uniq.values()) {
    const data = await db.table(table).get(key);
    rows.push({ user_id: userId, tbl: table, key, data: data ?? {}, deleted: !data });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase!.from('records').upsert(rows.slice(i, i + 500), { onConflict: 'user_id,tbl,key' });
    if (error) throw new Error(error.message);
  }
  await db.outbox.bulkDelete(items.map((i) => i.id!));
}

async function pullRecords() {
  const since = (await meta.get<string>('lastPull')) ?? '1970-01-01T00:00:00Z';
  // 5 min överlapp skyddar mot rader som skrevs samtidigt; senast-ändrad vinner ändå.
  const from = new Date(new Date(since).getTime() - 5 * 60_000).toISOString();
  let newest = since;
  for (let page = 0; ; page++) {
    const { data, error } = await supabase!
      .from('records')
      .select('tbl,key,data,deleted,updated_at')
      .gt('updated_at', from)
      .order('updated_at')
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    await withoutOutbox(async () => {
      for (const r of data) {
        if (!SYNCED_TABLES.includes(r.tbl)) continue;
        const table = db.table(r.tbl);
        const local = (await table.get(r.key)) as { updatedAt?: number } | undefined;
        const remoteAt = (r.data as { updatedAt?: number }).updatedAt ?? 0;
        if (r.deleted) {
          if (local && (local.updatedAt ?? 0) <= remoteAt) await table.delete(r.key);
        } else if (!local || (local.updatedAt ?? 0) <= remoteAt) {
          await table.put(r.data);
        }
        if (r.updated_at > newest) newest = r.updated_at;
      }
    });
    if (data.length < 1000) break;
  }
  await meta.set('lastPull', newest);
}

let inflight: Promise<void> | null = null;

/** Skicka lokala ändringar och hämta ändringar från andra enheter. */
export function syncNow(): Promise<void> {
  if (!supabase) return Promise.resolve();
  inflight ??= (async () => {
    const session = await getSession();
    if (!session) return;
    emit({ running: true, lastError: undefined });
    try {
      await pushOutbox(session.user.id);
      await pullRecords();
      emit({ lastSync: Date.now() });
      await meta.set('lastSync', Date.now());
    } catch (e) {
      emit({ lastError: navigator.onLine ? (e as Error).message : 'Offline – synkar när du har nät igen.' });
    } finally {
      emit({ running: false });
      inflight = null;
    }
  })();
  return inflight;
}

export function startAutoSync() {
  if (!supabase) return;
  void meta.get<number>('lastSync').then((t) => t && emit({ lastSync: t }));
  void syncNow();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void syncNow());
  window.addEventListener('online', () => void syncNow());
  setInterval(() => document.visibilityState === 'visible' && void syncNow(), 5 * 60_000);
  // Skicka lokala ändringar strax efter att de gjorts
  let t: ReturnType<typeof setTimeout> | undefined;
  db.outbox.hook('creating', () => {
    clearTimeout(t);
    t = setTimeout(() => void syncNow(), 4000);
  });
}
