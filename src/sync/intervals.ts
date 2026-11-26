import { db } from '../db/db';
import { addDays, today, type ISODate } from '../lib/dates';
import { applyImport, hashText, type ImportPayload } from '../lib/importer';

// Klocka → app via Intervals.icu (officiell Garmin-partner).
// Garmin Connect → Intervals.icu → den här appen. Nyckeln sparas bara i
// telefonen (tabellen meta, som varken synkas eller följer med i backup).

export interface IntervalsConfig {
  apiKey: string;
  athleteId: string;
  proxy?: string;
}

export interface IntervalsStatus {
  lastSync?: number;
  syncedUntil?: ISODate;
  message?: string;
  ok?: boolean;
}

const HISTORY_START = '2026-10-19'; // V1
const KEY = 'intervals';
const STATUS = 'intervalsStatus';

export async function getIntervalsConfig(): Promise<IntervalsConfig | undefined> {
  return (await db.meta.get(KEY))?.value as IntervalsConfig | undefined;
}
export async function saveIntervalsConfig(c: IntervalsConfig | undefined) {
  if (c) await db.meta.put({ key: KEY, value: c });
  else await db.meta.delete(KEY);
}
export async function getIntervalsStatus(): Promise<IntervalsStatus> {
  return ((await db.meta.get(STATUS))?.value as IntervalsStatus) ?? {};
}
async function setStatus(s: IntervalsStatus) {
  await db.meta.put({ key: STATUS, value: s });
}

export class IntervalsError extends Error {
  constructor(
    message: string,
    public kind: 'auth' | 'cors' | 'http' = 'http',
  ) {
    super(message);
  }
}

async function get<T>(c: IntervalsConfig, path: string): Promise<T> {
  const base = (c.proxy?.trim().replace(/\/$/, '') || 'https://intervals.icu') + '/api/v1';
  let res: Response;
  try {
    res = await fetch(base + path, { headers: { Authorization: 'Basic ' + btoa(`API_KEY:${c.apiKey.trim()}`) } });
  } catch {
    if (!navigator.onLine) throw new IntervalsError('Offline – synkar när du har nät igen.');
    throw new IntervalsError(
      c.proxy ? 'Mellanservern svarar inte. Kontrollera adressen.' : 'Intervals.icu blockerade anropet från appen. Lägg in en mellanserver (se README) och försök igen.',
      'cors',
    );
  }
  if (res.status === 401 || res.status === 403) throw new IntervalsError('Intervals.icu godkände inte nyckeln. Kontrollera API-nyckeln och atlet-id.', 'auth');
  if (!res.ok) throw new IntervalsError(`Intervals.icu svarade ${res.status}.`);
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Omvandling till appens importformat (rena funktioner, testas)

export interface IcuActivity {
  id: string | number;
  start_date_local?: string;
  type?: string;
  name?: string;
  distance?: number | null;
  moving_time?: number | null;
  elapsed_time?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
}

export interface IcuWellness {
  id: string; // datum
  restingHR?: number | null;
  hrv?: number | null;
  sleepSecs?: number | null;
  sleepScore?: number | null;
  steps?: number | null;
  weight?: number | null;
}

export function activitiesToPayload(list: IcuActivity[]): NonNullable<ImportPayload['activities']> {
  return list
    .filter((a) => a.start_date_local && a.type)
    .map((a) => ({
      source_id: `icu-${a.id}`,
      type: a.type!,
      name: a.name ?? undefined,
      start: a.start_date_local!.slice(0, 19),
      distance_km: a.distance ? Math.round(a.distance / 10) / 100 : undefined,
      duration_s: a.moving_time ?? a.elapsed_time ?? undefined,
      avg_hr: a.average_heartrate ? Math.round(a.average_heartrate) : undefined,
      max_hr: a.max_heartrate ? Math.round(a.max_heartrate) : undefined,
    }));
}

/**
 * Intervals.icu har HRV-värdet men inte Garmins status. Vi räknar fram en
 * status på samma sätt som Garmin ungefär gör: värdet jämförs med de senaste
 * tre veckornas baslinje (±1 standardavvikelse = balanserad).
 */
export function hrvStatus(date: ISODate, hrv: number, history: { date: ISODate; hrv?: number | null }[]): 'BALANCED' | 'UNBALANCED' | undefined {
  const base = history.filter((h) => h.hrv && h.date < date && h.date >= addDays(date, -21)).map((h) => h.hrv!);
  if (base.length < 7) return undefined;
  const mean = base.reduce((a, b) => a + b, 0) / base.length;
  const sd = Math.sqrt(base.reduce((a, b) => a + (b - mean) ** 2, 0) / base.length);
  return Math.abs(hrv - mean) <= Math.max(sd, mean * 0.05) ? 'BALANCED' : 'UNBALANCED';
}

export function wellnessToPayload(list: IcuWellness[], previous: { date: ISODate; hrv?: number | null }[] = []): Pick<ImportPayload, 'daily' | 'weigh_ins'> {
  const sorted = [...list].sort((a, b) => a.id.localeCompare(b.id));
  const hist = [...previous, ...sorted.map((w) => ({ date: w.id, hrv: w.hrv }))];
  const daily = sorted
    .map((w) => ({
      date: w.id,
      steps: w.steps ?? undefined,
      sleep_h: w.sleepSecs ? Math.round((w.sleepSecs / 3600) * 100) / 100 : undefined,
      sleep_score: w.sleepScore ?? undefined,
      resting_hr: w.restingHR ?? undefined,
      hrv: w.hrv ? Math.round(w.hrv) : undefined,
      hrv_status: w.hrv ? hrvStatus(w.id, w.hrv, hist) : undefined,
    }))
    .filter((d) => Object.values(d).filter((v) => v !== undefined).length > 1);
  const weigh_ins = sorted.filter((w) => w.weight).map((w) => ({ date: w.id, kg: Math.round(w.weight! * 10) / 10 }));
  return { daily, weigh_ins };
}

// ---------------------------------------------------------------------------

let running: Promise<IntervalsStatus> | null = null;

/** Hämta nytt från Intervals.icu. Första gången hämtas allt från V1 (19 okt). */
export function syncIntervals(opts: { full?: boolean } = {}): Promise<IntervalsStatus> {
  running ??= (async () => {
    const c = await getIntervalsConfig();
    if (!c?.apiKey) {
      running = null;
      return {};
    }
    const prev = await getIntervalsStatus();
    const newest = today();
    const oldest = !opts.full && prev.syncedUntil ? addDays(prev.syncedUntil, -3) : HISTORY_START;
    const athlete = c.athleteId?.trim() || '0';
    try {
      const [acts, well] = await Promise.all([
        get<IcuActivity[]>(c, `/athlete/${athlete}/activities?oldest=${oldest}&newest=${newest}`),
        get<IcuWellness[]>(c, `/athlete/${athlete}/wellness?oldest=${addDays(oldest, -21)}&newest=${newest}`),
      ]);
      const previous = (await db.health.where('date').between(addDays(oldest, -21), oldest).toArray()).map((h) => ({ date: h.date, hrv: h.hrv }));
      const w = wellnessToPayload(well, previous);
      const payload: ImportPayload = {
        format: 'nellie-traning/v1',
        source: 'intervals.icu',
        activities: activitiesToPayload(acts),
        daily: (w.daily ?? []).filter((d) => d.date >= oldest),
        weigh_ins: (w.weigh_ins ?? []).filter((x) => x.date >= oldest),
      };
      const n = (payload.activities?.length ?? 0) + (payload.daily?.length ?? 0);
      if (n || payload.weigh_ins?.length) {
        const hash = await hashText(JSON.stringify(payload));
        if (!(await db.imports.get(hash))) await applyImport(payload, { hash, source: 'garmin', label: `Intervals.icu ${oldest}–${newest}` });
      }
      const stepsMissing = (payload.daily?.length ?? 0) > 3 && payload.daily!.every((d) => d.steps == null);
      const st: IntervalsStatus = {
        lastSync: Date.now(),
        syncedUntil: newest,
        ok: true,
        message:
          `${payload.activities?.length ?? 0} pass och ${payload.daily?.length ?? 0} dagar hämtade` +
          (stepsMissing ? '. Steg saknas i Intervals.icu – kolla att "Download wellness data" är påslaget för steg.' : ''),
      };
      await setStatus(st);
      return st;
    } catch (e) {
      const st: IntervalsStatus = { ...prev, ok: false, message: (e as Error).message };
      await setStatus(st);
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Synka automatiskt när appen öppnas och kommer fram igen (högst var 10:e minut). */
export function startIntervalsAutoSync() {
  const tick = async () => {
    const s = await getIntervalsStatus();
    if (!s.lastSync || Date.now() - s.lastSync > 10 * 60_000) syncIntervals().catch(() => undefined);
  };
  void tick();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && void tick());
  window.addEventListener('online', () => void tick());
}
