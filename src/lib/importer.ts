import { db, uid } from '../db/db';
import { getSettings } from '../db/repo';
import { addDays, diffDays, type ISODate } from './dates';
import { EXERCISES, matchExerciseName } from './exercises';
import { capVerdict } from './rules';
import type { Activity, DailyHealth, PlannedSession, SessionKind, SetLog, WeighIn, WorkoutLog } from './types';

// ---------------------------------------------------------------------------
// Appens importformat. Samma format används av:
//  - Garmin-synkjobbet (GitHub Actions → Supabase → appen)
//  - "Synka via Claude" (hennes Claude svarar med JSON)
//  - fritext/gymanteckningar via Claude
//  - JSON-backup

export const IMPORT_FORMAT = 'nellie-traning/v1';

export interface ImportPayload {
  format?: string;
  source?: string;
  activities?: {
    garmin_id?: number | string;
    /** Id från en annan källa, t.ex. "icu-i12345" från Intervals.icu */
    source_id?: string;
    type: string;
    name?: string;
    start: string;
    distance_km?: number;
    duration_s?: number;
    avg_hr?: number;
    max_hr?: number;
    avg_pace_s_per_km?: number;
    sets?: { exercise: string; reps?: number; weight_kg?: number }[];
  }[];
  daily?: {
    date: string;
    steps?: number;
    sleep_h?: number;
    sleep_score?: number;
    resting_hr?: number;
    hrv?: number;
    hrv_status?: string;
    intensity_min?: number;
  }[];
  weigh_ins?: { date: string; kg: number }[];
  race_predictions?: { date: string; k5_s?: number; k10_s?: number; half_s?: number }[];
  workouts?: {
    date: string;
    title?: string;
    sets: { exercise: string; set?: number; reps?: number; weight_kg?: number; seconds?: number; assist_kg?: number; note?: string }[];
  }[];
}

export const EXAMPLE_PAYLOAD: ImportPayload = {
  format: IMPORT_FORMAT,
  activities: [
    { garmin_id: 12345678901, type: 'running', name: 'Göteborg Löpning', start: '2026-11-22T09:15:00', distance_km: 15.0, duration_s: 7185, avg_hr: 161, max_hr: 177 },
    { garmin_id: 12345678902, type: 'swimming', start: '2026-11-20T18:00:00', distance_km: 1.2, duration_s: 2400 },
  ],
  daily: [{ date: '2026-11-25', steps: 15100, sleep_h: 8.3, sleep_score: 84, resting_hr: 50, hrv: 82, hrv_status: 'BALANCED', intensity_min: 45 }],
  weigh_ins: [{ date: '2026-11-25', kg: 60.2 }],
  race_predictions: [{ date: '2026-11-25', k5_s: 1561, k10_s: 3378, half_s: 7767 }],
  workouts: [
    {
      date: '2026-11-17',
      title: 'Ben och säte',
      sets: [
        { exercise: 'Knäböj', set: 1, reps: 10, weight_kg: 40 },
        { exercise: 'Knäböj', set: 2, reps: 9, weight_kg: 40 },
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Tolkning

export class ImportError extends Error {}

/** Plocka ut JSON även om Claude har skrivit text runt omkring eller använt ```json-block. */
export function extractJson(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = (fenced ? fenced[1] : raw).trim();
  const start = text.search(/[[{]/);
  if (start < 0) throw new ImportError('Hittade ingen JSON i texten.');
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'));
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new ImportError('JSON:en gick inte att läsa. Be Claude svara med enbart JSON i ett kodblock.');
  }
}

const num = (v: unknown) => (v == null || v === '' ? undefined : Number.isFinite(Number(v)) ? Number(v) : undefined);
const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v);

export function normalizePayload(input: unknown): ImportPayload {
  if (!input || typeof input !== 'object') throw new ImportError('Fel format.');
  // Backup från appen
  if ((input as Record<string, unknown>).app === 'traningsapp') return { format: 'backup', ...(input as object) } as ImportPayload;
  const p = input as ImportPayload;
  const out: ImportPayload = { format: p.format ?? IMPORT_FORMAT, source: p.source };
  out.activities = (p.activities ?? [])
    .filter((a) => a && isDate(a.start))
    .map((a) => ({
      ...a,
      distance_km: num(a.distance_km),
      duration_s: num(a.duration_s),
      avg_hr: num(a.avg_hr),
      max_hr: num(a.max_hr),
    }));
  out.daily = (p.daily ?? []).filter((d) => d && isDate(d.date)).map((d) => ({ ...d, date: d.date.slice(0, 10) }));
  out.weigh_ins = (p.weigh_ins ?? []).filter((w) => w && isDate(w.date) && num(w.kg)).map((w) => ({ date: w.date.slice(0, 10), kg: Number(w.kg) }));
  out.race_predictions = (p.race_predictions ?? []).filter((r) => r && isDate(r.date));
  out.workouts = (p.workouts ?? []).filter((w) => w && isDate(w.date) && Array.isArray(w.sets) && w.sets.length);
  const total = out.activities.length + out.daily.length + out.weigh_ins.length + out.workouts.length + out.race_predictions.length;
  if (!total) throw new ImportError('Filen innehöll inga pass, dagsvärden, invägningar eller gympass.');
  return out;
}

/** CSV-mall: datum, övning, set, reps, vikt_kg, anteckning */
export const CSV_TEMPLATE = 'datum,övning,set,reps,vikt_kg,anteckning\n2026-11-17,Knäböj,1,10,40,\n2026-11-17,Knäböj,2,9,40,tungt sista\n2026-11-17,Rumänsk marklyft,1,10,35,\n';

export function parseCsv(text: string): ImportPayload {
  const rows = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!rows.length) throw new ImportError('Tom fil.');
  const sep = rows[0].includes(';') && !rows[0].includes(',') ? ';' : ',';
  const header = rows[0].toLowerCase().split(sep).map((h) => h.trim());
  const idx = (n: string[]) => header.findIndex((h) => n.includes(h));
  const iDate = idx(['datum', 'date']);
  const iEx = idx(['övning', 'ovning', 'exercise']);
  const iSet = idx(['set']);
  const iReps = idx(['reps']);
  const iKg = idx(['vikt_kg', 'vikt', 'kg', 'weight_kg']);
  const iNote = idx(['anteckning', 'note']);
  if (iDate < 0 || iEx < 0) throw new ImportError('CSV:n behöver kolumnerna datum och övning.');
  const byDate = new Map<string, NonNullable<ImportPayload['workouts']>[number]>();
  for (const line of rows.slice(1)) {
    const c = line.split(sep).map((x) => x.trim());
    const date = c[iDate];
    if (!isDate(date)) continue;
    const w = byDate.get(date) ?? { date, title: 'Importerat gympass', sets: [] };
    w.sets.push({
      exercise: c[iEx],
      set: num(c[iSet]),
      reps: num(c[iReps]),
      weight_kg: num(c[iKg]?.replace(',', '.')),
      note: iNote >= 0 ? c[iNote] || undefined : undefined,
    });
    byDate.set(date, w);
  }
  return normalizePayload({ format: IMPORT_FORMAT, source: 'csv', workouts: [...byDate.values()] });
}

// ---------------------------------------------------------------------------
// Förhandsgranskning och import

export async function hashText(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

const ACT_TYPE: [RegExp, Activity['type']][] = [
  [/swim/i, 'swimming'],
  [/run|löp|jog/i, 'running'],
  [/strength|styrk|gym|weight/i, 'strength'],
  [/walk|hik|prom/i, 'walking'],
];
export const mapActivityType = (t: string): Activity['type'] => ACT_TYPE.find(([re]) => re.test(t))?.[1] ?? 'other';

const activityId = (a: NonNullable<ImportPayload['activities']>[number]) =>
  a.garmin_id != null ? `garmin-${a.garmin_id}` : a.source_id ? a.source_id : `import-${a.start}-${mapActivityType(a.type)}`;

/** Samma pass från en annan källa (Claude, Intervals.icu): samma typ och start inom 3 min. */
async function sameActivity(a: NonNullable<ImportPayload['activities']>[number]): Promise<Activity | undefined> {
  const id = activityId(a);
  const exact = await db.activities.get(id);
  if (exact) return exact;
  const t = new Date(a.start).getTime();
  const type = mapActivityType(a.type);
  return (await db.activities.where('date').equals(a.start.slice(0, 10)).toArray()).find(
    (x) => x.type === type && Math.abs(new Date(x.start).getTime() - t) <= 180_000,
  );
}

const garminKeyToExercise = new Map<string, string>();
for (const e of EXERCISES) if (e.garmin.name && !e.excluded && !garminKeyToExercise.has(e.garmin.name)) garminKeyToExercise.set(e.garmin.name, e.id);

export function resolveExercise(name: string): string | undefined {
  const key = name.toUpperCase().split('/').pop()!.replace(/\s+/g, '_');
  return garminKeyToExercise.get(key) ?? matchExerciseName(name.replace(/_/g, ' '))?.id;
}

export interface ImportPreview {
  hash: string;
  alreadyImported: boolean;
  activities: { new: number; updated: number };
  daily: number;
  weighIns: number;
  workouts: { new: number; duplicate: number; unknownExercises: string[] };
  predictions: number;
  beforeApp: number;
}

export async function previewImport(p: ImportPayload, rawText: string): Promise<ImportPreview> {
  const hash = await hashText(rawText);
  const s = await getSettings();
  const restart = addDays(s.week1Start, (s.restartWeek - 1) * 7);
  let newA = 0;
  let updA = 0;
  for (const a of p.activities ?? []) {
    if (await sameActivity(a)) updA++;
    else newA++;
  }
  const unknown = new Set<string>();
  let newW = 0;
  let dupW = 0;
  for (const w of p.workouts ?? []) {
    const h = await workoutHash(w);
    if (await db.workoutLogs.filter((x) => x.importHash === h).count()) dupW++;
    else newW++;
    for (const st of w.sets) if (!resolveExercise(st.exercise)) unknown.add(st.exercise);
  }
  const dates = [...(p.activities ?? []).map((a) => a.start.slice(0, 10)), ...(p.workouts ?? []).map((w) => w.date)];
  return {
    hash,
    alreadyImported: !!(await db.imports.get(hash)),
    activities: { new: newA, updated: updA },
    daily: p.daily?.length ?? 0,
    weighIns: p.weigh_ins?.length ?? 0,
    workouts: { new: newW, duplicate: dupW, unknownExercises: [...unknown] },
    predictions: p.race_predictions?.length ?? 0,
    beforeApp: dates.filter((d) => d < restart).length,
  };
}

async function workoutHash(w: NonNullable<ImportPayload['workouts']>[number]) {
  return hashText(JSON.stringify([w.date, w.sets.map((s) => [s.exercise, s.set, s.reps, s.weight_kg, s.seconds, s.assist_kg])]));
}

const HRV: Record<string, DailyHealth['hrvStatus']> = { BALANCED: 'BALANCED', UNBALANCED: 'UNBALANCED', LOW: 'LOW', POOR: 'POOR' };

/** Spara en import. Idempotent: samma data två gånger skapar inga dubbletter. */
export async function applyImport(p: ImportPayload, opts: { hash: string; source: 'csv' | 'json' | 'claude' | 'garmin' | 'backup'; label: string }) {
  const s = await getSettings();
  const restart = addDays(s.week1Start, (s.restartWeek - 1) * 7);
  const now = Date.now();
  let count = 0;
  // Hashar räknas före transaktionen (crypto.subtle får inte köras inuti en Dexie-transaktion)
  const wHashes = await Promise.all((p.workouts ?? []).map(workoutHash));

  await db.transaction('rw', [db.activities, db.health, db.weighIns, db.workoutLogs, db.setLogs, db.imports], async () => {
    for (const a of p.activities ?? []) {
      const prev = await sameActivity(a);
      const id = prev?.id ?? activityId(a);
      const date = a.start.slice(0, 10);
      const pace = a.avg_pace_s_per_km ?? (a.distance_km && a.duration_s ? a.duration_s / a.distance_km : undefined);
      await db.activities.put({
        ...prev,
        id,
        garminId: a.garmin_id != null && Number.isFinite(Number(a.garmin_id)) ? Number(a.garmin_id) : prev?.garminId,
        type: mapActivityType(a.type),
        name: a.name ?? prev?.name,
        start: a.start,
        date,
        // Behåll befintliga värden om den nya källan saknar dem
        distanceKm: a.distance_km ?? prev?.distanceKm,
        durationSec: a.duration_s ?? prev?.durationSec,
        avgHr: a.avg_hr ?? prev?.avgHr,
        maxHr: a.max_hr ?? prev?.maxHr,
        paceSecPerKm: pace ?? prev?.paceSecPerKm,
        sets: a.sets?.map((x) => ({ exercise: x.exercise, reps: x.reps, weightKg: x.weight_kg })) ?? prev?.sets,
        source: opts.source === 'garmin' ? 'garmin' : opts.source === 'claude' ? 'claude' : 'import',
        beforeApp: date < restart || undefined,
        updatedAt: now,
      });
      count++;
    }
    for (const d of p.daily ?? []) {
      const prev = await db.health.get(d.date);
      const merged: DailyHealth = { ...(prev ?? { date: d.date }), updatedAt: now };
      // Skriv bara över fält som faktiskt har värden
      if (d.steps != null) merged.steps = d.steps;
      if (d.sleep_h != null) merged.sleepH = d.sleep_h;
      if (d.sleep_score != null) merged.sleepScore = d.sleep_score;
      if (d.resting_hr != null) merged.restingHr = d.resting_hr;
      if (d.hrv != null) merged.hrv = d.hrv;
      if (d.hrv_status) merged.hrvStatus = HRV[d.hrv_status.toUpperCase()] ?? 'NONE';
      if (d.intensity_min != null) merged.intensityMin = d.intensity_min;
      await db.health.put(merged);
      count++;
    }
    for (const r of p.race_predictions ?? []) {
      const date = r.date.slice(0, 10);
      const prev = await db.health.get(date);
      await db.health.put({ ...(prev ?? { date }), raceTimes: { k5: r.k5_s, k10: r.k10_s, half: r.half_s }, updatedAt: now });
    }
    for (const w of p.weigh_ins ?? []) {
      const id = `w-${w.date}-${w.kg.toFixed(1)}`;
      const exists = await db.weighIns.where('date').equals(w.date).filter((x) => Math.abs(x.kg - w.kg) < 0.05 && !x.deleted).count();
      if (!exists) {
        const row: WeighIn = { id, date: w.date, kg: Math.round(w.kg * 10) / 10, source: opts.source === 'garmin' ? 'garmin' : 'import', updatedAt: now };
        await db.weighIns.put(row);
        count++;
      }
    }
    for (const [wi, w] of (p.workouts ?? []).entries()) {
      const h = wHashes[wi];
      if (await db.workoutLogs.filter((x) => x.importHash === h && !x.deleted).count()) continue;
      const ids = w.sets.map((x) => resolveExercise(x.exercise));
      const kind: SessionKind = ids.some((i) => i && ['squat', 'rdl', 'bulgarian', 'leg-press', 'hack-squat', 'goblet-squat', 'pull-through', 'abduction'].includes(i))
        ? 'gymA'
        : ids.some((i) => i && ['db-bench', 'shoulder-press', 'lateral-raise', 'triceps-pushdown', 'incline-db-bench'].includes(i)) && !ids.includes('lat-pulldown')
          ? 'gymExtra'
          : 'gymB';
      const log: WorkoutLog = {
        id: uid(),
        date: w.date,
        kind,
        title: w.title ?? 'Importerat gympass',
        startedAt: now,
        finishedAt: now,
        swaps: {},
        notes: {},
        exerciseRpe: {},
        status: 'done',
        source: opts.source === 'garmin' ? 'garmin' : 'import',
        beforeApp: w.date < restart || undefined,
        importHash: h,
        updatedAt: now,
      };
      await db.workoutLogs.put(log);
      const perEx = new Map<string, number>();
      const sets: SetLog[] = [];
      w.sets.forEach((x, i) => {
        const exId = ids[i];
        if (!exId) return;
        const n = perEx.get(exId) ?? 0;
        perEx.set(exId, n + 1);
        sets.push({
          id: uid(),
          workoutLogId: log.id,
          exerciseId: exId,
          slotExerciseId: `imp:${exId}`,
          setIndex: x.set != null ? x.set - 1 : n,
          weightKg: x.weight_kg,
          reps: x.reps,
          seconds: x.seconds,
          assistKg: x.assist_kg,
          done: true,
          date: w.date,
          source: 'import',
          updatedAt: now,
        });
        if (x.note) log.notes[`imp:${exId}`] = x.note;
      });
      if (Object.keys(log.notes).length) await db.workoutLogs.put(log);
      if (sets.length) await db.setLogs.bulkPut(sets);
      count++;
    }
    await db.imports.put({ id: opts.hash, source: opts.source, at: now, count, label: opts.label });
  });

  const matched = await matchActivities();
  return { count, matched };
}

// ---------------------------------------------------------------------------
// Matchning: aktivitet → planerat pass

const RUN_KINDS: SessionKind[] = ['easy', 'quality', 'long', 'race'];
const GYM_KINDS: SessionKind[] = ['gymA', 'gymB', 'gymExtra', 'gymFull', 'activation'];

function fits(a: Activity, x: PlannedSession) {
  if (a.type === 'running') return RUN_KINDS.includes(x.kind);
  if (a.type === 'swimming') return x.kind === 'swim';
  if (a.type === 'strength') return GYM_KINDS.includes(x.kind);
  return false;
}

/**
 * Koppla okopplade aktiviteter till planerade pass: samma dag och typ först,
 * annars närmaste dag ±1. Långa löprundor föredrar långpasset.
 */
export async function matchActivities(): Promise<number> {
  const s = await getSettings();
  const acts = (await db.activities.toArray()).filter((a) => !a.linkedSessionId && ['running', 'swimming', 'strength'].includes(a.type));
  let n = 0;
  for (const a of acts.sort((x, y) => x.start.localeCompare(y.start))) {
    const near = await db.sessions.where('date').between(addDays(a.date, -1), addDays(a.date, 1), true, true).toArray();
    const candidates = near
      .filter((x) => fits(a, x) && !x.activityId && x.status !== 'skipped' && (x.status !== 'done' || (x.type === 'strength' && !!x.workoutLogId)))
      .sort((x, y) => {
        const dx = Math.abs(diffDays(x.date, a.date));
        const dy = Math.abs(diffDays(y.date, a.date));
        if (dx !== dy) return dx - dy;
        if (a.type === 'running') {
          const want = (a.distanceKm ?? 0) >= 9 ? 'long' : 'easy';
          return (y.kind === want ? 1 : 0) - (x.kind === want ? 1 : 0);
        }
        return 0;
      });
    const target = candidates[0];
    if (!target) {
      // Okopplat löppass: ge ändå ett omdöme utifrån längden
      if (a.type === 'running' && a.avgHr && !a.capVerdict) {
        const v = capVerdict((a.distanceKm ?? 0) >= 9 ? 'long' : 'easy', a.avgHr, s);
        await db.activities.update(a.id, { withinCap: v?.ok, capVerdict: v ? `${v.emoji} ${v.text}` : undefined, updatedAt: Date.now() });
      }
      continue;
    }
    const v = a.type === 'running' ? capVerdict(target.kind === 'race' ? 'long' : target.kind, a.avgHr, s) : undefined;
    await db.activities.update(a.id, { linkedSessionId: target.id, withinCap: v?.ok, capVerdict: v ? `${v.emoji} ${v.text}` : undefined, updatedAt: Date.now() });
    await db.sessions.update(target.id, { status: 'done', activityId: a.id, updatedAt: Date.now() });
    // Styrkepass från klockan: förifyll loggen om hon inte loggat själv i appen
    if (a.type === 'strength' && a.sets?.length && !target.workoutLogId) await strengthFromWatch(a, target);
    n++;
  }
  return n;
}

async function strengthFromWatch(a: Activity, target: PlannedSession) {
  const now = Date.now();
  const log: WorkoutLog = {
    id: uid(),
    date: a.date,
    sessionId: target.id,
    kind: target.kind,
    title: target.title,
    startedAt: new Date(a.start).getTime() || now,
    finishedAt: (new Date(a.start).getTime() || now) + (a.durationSec ?? 0) * 1000,
    swaps: {},
    notes: {},
    exerciseRpe: {},
    status: 'done',
    source: 'garmin',
    updatedAt: now,
  };
  const counts = new Map<string, number>();
  const sets: SetLog[] = [];
  for (const x of a.sets ?? []) {
    const exId = resolveExercise(x.exercise);
    if (!exId) continue;
    const i = counts.get(exId) ?? 0;
    counts.set(exId, i + 1);
    sets.push({ id: uid(), workoutLogId: log.id, exerciseId: exId, slotExerciseId: `watch:${exId}`, setIndex: i, reps: x.reps, weightKg: x.weightKg, done: true, date: a.date, source: 'garmin', updatedAt: now });
  }
  if (!sets.length) return;
  await db.workoutLogs.put(log);
  await db.setLogs.bulkPut(sets);
  await db.sessions.update(target.id, { workoutLogId: log.id });
}

// ---------------------------------------------------------------------------
// Prompter till hennes Claude

export function claudeSyncPrompt(from: ISODate, to: ISODate): string {
  return `Du har tillgång till mina Garmin-verktyg. Hämta min data från ${from} till ${to} och svara ENDAST med ett JSON-kodblock i exakt det här formatet (utelämna fält du inte hittar, hitta inte på värden):

\`\`\`json
${JSON.stringify(EXAMPLE_PAYLOAD, null, 2)}
\`\`\`

Så här fyller du i:
- "activities": alla aktiviteter (get_activities_by_date). type = Garmins aktivitetstyp (t.ex. running, treadmill_running, lap_swimming, strength_training, walking). garmin_id = activityId. start = lokal starttid. distance_km i km, duration_s i sekunder, avg_hr/max_hr i bpm.
- För styrkepass: lägg till "sets" från get_activity_exercise_sets med exercise = Garmins övningsnamn (t.ex. "BARBELL_BACK_SQUAT"), reps och weight_kg (omvandla från gram om det behövs).
- "daily": en rad per dag: steps (get_daily_steps eller get_stats), sleep_h (sömn i timmar, get_sleep_data), sleep_score, resting_hr (vilopuls), hrv (natt-snitt i ms från get_hrv_data) och hrv_status (BALANCED/UNBALANCED/LOW/POOR), intensity_min (måttliga + 2 × höga intensitetsminuter).
- "weigh_ins": alla invägningar i kg (get_weigh_ins).
- "race_predictions": dagens prognos (get_race_predictions) i sekunder för 5 km, 10 km och halvmaraton.
- Ta inte med "workouts" – de är bara för manuella gymanteckningar.

Svara bara med JSON-blocket, ingen annan text.`;
}

export function claudeGymPrompt(): string {
  return `Jag vill flytta in mina gamla gympass i min träningsapp. Gör om anteckningarna nedan (eller, om du har tillgång till mina Garmin-verktyg och jag ber om det: mina styrkepass från Garmin via get_activities_by_date + get_activity_exercise_sets) till JSON i exakt det här formatet:

\`\`\`json
{
  "format": "${IMPORT_FORMAT}",
  "workouts": [
    {
      "date": "2026-11-17",
      "title": "Ben och säte",
      "sets": [
        { "exercise": "Knäböj", "set": 1, "reps": 10, "weight_kg": 40 },
        { "exercise": "Knäböj", "set": 2, "reps": 8, "weight_kg": 42.5, "note": "tungt" },
        { "exercise": "Dead hang", "set": 1, "seconds": 15 },
        { "exercise": "Assisterad pull-up i maskin", "set": 1, "reps": 6, "assist_kg": 35 }
      ]
    }
  ]
}
\`\`\`

Regler:
- Ett objekt per pass och datum (ÅÅÅÅ-MM-DD). Ett objekt i "sets" per set.
- Använd svenska övningsnamn om möjligt: Knäböj, Rumänsk marklyft, Bulgarisk utfallsböj, Pull-through i kabel, Abduktionsmaskin, Latsdrag, Sittande rodd, Ryggresningar, Face pulls, Hantelpress på bänk, Axelpress med hantlar, Sidolyft, Triceps-pushdown, Plankan, Hängande knälyft, Dead hang, Assisterad pull-up i maskin.
- Vikt i kg. För assisterad maskin: motvikten i "assist_kg". För håll: "seconds".
- Gissa inte värden som saknas – utelämna dem.
- Svara bara med JSON-blocket.

Mina anteckningar:
[KLISTRA IN HÄR]`;
}

// ---------------------------------------------------------------------------
// Återställ backup (JSON-export från Inställningar)

export async function restoreBackup(data: Record<string, unknown>) {
  const { SYNCED_TABLES } = await import('../db/db');
  let n = 0;
  await db.transaction('rw', SYNCED_TABLES.map((t) => db.table(t)), async () => {
    for (const t of SYNCED_TABLES) {
      const rows = data[t];
      if (!Array.isArray(rows)) continue;
      const table = db.table(t);
      for (const r of rows) {
        const key = (r as Record<string, unknown>)[table.schema.primKey.keyPath as string];
        const cur = (await table.get(key as string)) as { updatedAt?: number } | undefined;
        if (!cur || (cur.updatedAt ?? 0) <= ((r as { updatedAt?: number }).updatedAt ?? 0)) {
          await table.put(r);
          n++;
        }
      }
    }
  });
  return n;
}
