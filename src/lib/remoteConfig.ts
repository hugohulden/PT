import { db } from '../db/db';
import { getSettings, regeneratePlan, saveSettings } from '../db/repo';
import type { Settings } from './types';

// Hugo kan ändra public/config.json i repot. Appen hämtar filen och tar in
// det som har ändrats sedan förra versionen av filen – bara de nycklarna.
// Nellies egna ändringar av andra inställningar ligger kvar.

export interface RemoteConfig {
  version: number;
  message?: string;
  settings: Partial<Settings>;
}

/** Inställningar som får styras från config.json (inte tema, ljud, egna citat). */
export const REMOTE_KEYS = [
  'name',
  'week1Start',
  'raceDate',
  'raceName',
  'weekdays',
  'hr',
  'easyPaceSec',
  'racePaceSec',
  'deloadWeeks',
  'pullupTestWeeks',
  'readiness',
  'restSeconds',
  'steps',
] as const satisfies readonly (keyof Settings)[];

export const KEY_LABEL: Record<(typeof REMOTE_KEYS)[number], string> = {
  name: 'namn',
  week1Start: 'startdatum',
  raceDate: 'loppdatum',
  raceName: 'loppnamn',
  weekdays: 'veckodagar för passen',
  hr: 'pulstak',
  easyPaceSec: 'lugn fart',
  racePaceSec: 'loppfart',
  deloadWeeks: 'avlastningsveckor',
  pullupTestWeeks: 'pull-up-tester',
  readiness: 'dagsformsregler',
  restSeconds: 'vilotid',
  steps: 'stegmål',
};

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Räkna ut vad som ska ändras. Första gången (ingen tidigare fil) sparas bara
 * filen som utgångsläge, utan att ändra något.
 */
export function diffRemote(prev: RemoteConfig | undefined, next: RemoteConfig): Partial<Settings> {
  if (!prev || next.version <= prev.version) return {};
  const patch: Partial<Settings> = {};
  for (const k of REMOTE_KEYS) {
    if (!(k in next.settings)) continue;
    if (!same(prev.settings[k], next.settings[k])) (patch as Record<string, unknown>)[k] = next.settings[k];
  }
  return patch;
}

export interface RemoteResult {
  changed: string[];
  message?: string;
  version?: number;
}

export async function checkRemoteConfig(): Promise<RemoteResult> {
  let next: RemoteConfig;
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}config.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return { changed: [] };
    next = await res.json();
    if (typeof next?.version !== 'number' || !next.settings) return { changed: [] };
  } catch {
    return { changed: [] }; // offline – försök nästa gång
  }
  const prev = (await db.meta.get('remoteConfig'))?.value as RemoteConfig | undefined;
  const patch = diffRemote(prev, next);
  const keys = Object.keys(patch) as (typeof REMOTE_KEYS)[number][];
  if (keys.length) {
    const cur = await getSettings();
    // Pulstak och dagsformsregler slås ihop fält för fält
    const merged = { ...patch } as Partial<Settings>;
    if (patch.hr) merged.hr = { ...cur.hr, ...patch.hr };
    if (patch.readiness) merged.readiness = { ...cur.readiness, ...patch.readiness };
    if (patch.steps) merged.steps = { ...cur.steps, ...patch.steps };
    await saveSettings(merged);
  }
  if (!prev || next.version !== prev.version) await db.meta.put({ key: 'remoteConfig', value: next });
  const isNew = !!prev && next.version > prev.version;
  return { changed: keys.map((k) => KEY_LABEL[k]), message: isNew && next.message ? next.message : undefined, version: next.version };
}

/** Ny version av appen: räkna om planen så att ändringar i plantabellerna kommer med. */
export async function onAppVersion(version: string): Promise<boolean> {
  const prev = (await db.meta.get('appVersion'))?.value;
  if (prev === version) return false;
  await db.meta.put({ key: 'appVersion', value: version });
  if (prev) await regeneratePlan();
  return !!prev;
}

/** Be iPhone hämta en ny version av appen nu. Returnerar true om en ny hittades. */
export async function checkAppUpdate(): Promise<boolean> {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg) return false;
  await reg.update();
  return !!(reg.installing || reg.waiting);
}
