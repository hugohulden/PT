import { db, uid } from './db';
import { DEFAULT_SETTINGS } from '../lib/settings';
import { generatePlan, mergePlan } from '../lib/plan/generator';
import { exercise } from '../lib/exercises';
import { suggestWeight, type WeightSuggestion } from '../lib/rules';
import { dayShort, today, type ISODate } from '../lib/dates';
import type { PlannedSession, PR, SessionKind, SetLog, Settings, StrengthItem, WorkoutLog } from '../lib/types';

// ---------------------------------------------------------------------------
// Inställningar och plan

export async function getSettings(): Promise<Settings> {
  const s = await db.settings.get('main');
  return s ? { ...DEFAULT_SETTINGS, ...s } : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  const next = { ...cur, ...patch, id: 'main' as const, updatedAt: Date.now() };
  await db.settings.put(next);
  const planChanged = ['week1Start', 'raceDate', 'weekdays', 'hr', 'deloadWeeks', 'pullupTestWeeks', 'phases', 'easyPaceSec', 'racePaceSec', 'restartWeek', 'raceWeek'].some(
    (k) => k in patch,
  );
  if (planChanged) await regeneratePlan(next);
  return next;
}

export async function regeneratePlan(s?: Settings) {
  const settings = s ?? (await getSettings());
  const existing = await db.sessions.toArray();
  const merged = mergePlan(generatePlan(settings), existing);
  const keep = new Set(merged.map((m) => m.id));
  await db.transaction('rw', db.sessions, async () => {
    // Ta bort genererade pass som inte längre finns (t.ex. efter ändrad veckodag) men aldrig något hon rört
    const stale = existing.filter((e) => !keep.has(e.id) && !e.userModified && e.status === 'planned').map((e) => e.id);
    if (stale.length) await db.sessions.bulkDelete(stale);
    const changed = merged.filter((m) => {
      const e = existing.find((x) => x.id === m.id);
      return !e || JSON.stringify(e) !== JSON.stringify(m);
    });
    if (changed.length) await db.sessions.bulkPut(changed);
  });
}

export async function ensureInitialized() {
  const has = await db.sessions.count();
  if (!has) {
    if (!(await db.settings.get('main'))) await db.settings.put({ ...DEFAULT_SETTINGS, updatedAt: Date.now() });
    await regeneratePlan();
  }
}

export async function updateSession(id: string, patch: Partial<PlannedSession>) {
  const cur = await db.sessions.get(id);
  if (!cur) return;
  await db.sessions.put({ ...cur, ...patch, userModified: true, updatedAt: Date.now() });
}

export async function moveSession(id: string, date: ISODate) {
  const cur = await db.sessions.get(id);
  if (!cur) return;
  await updateSession(id, {
    date,
    status: date === cur.originalDate ? 'planned' : 'moved',
    garminName: cur.garminName?.replace(/^(RK V\d\d) \S+ –/, `$1 ${dayShort(date)} –`),
    garminDirty: cur.garminName ? true : cur.garminDirty,
  });
}

export async function addExtraSession(date: ISODate, week: number) {
  const { buildStrength } = await import('../lib/plan/strength');
  const s: PlannedSession = {
    id: `w${String(week).padStart(2, '0')}-gymExtra-${date}`,
    week,
    date,
    originalDate: date,
    type: 'strength',
    kind: 'gymExtra',
    title: 'Extrapass – Bröst, axlar & triceps',
    strength: buildStrength('gymExtra', 'base', week, { deload: false, pullupTest: false }),
    status: 'planned',
    userModified: true,
    updatedAt: Date.now(),
  };
  await db.sessions.put(s);
  return s;
}

// ---------------------------------------------------------------------------
// Gympass

export async function activeWorkout(): Promise<WorkoutLog | undefined> {
  return db.workoutLogs.where('status').equals('active').first();
}

export async function startWorkout(session: PlannedSession | undefined, kind: SessionKind = 'gymA', date: ISODate = today()): Promise<WorkoutLog> {
  const existing = session ? await db.workoutLogs.where('sessionId').equals(session.id).filter((w) => !w.deleted).first() : undefined;
  if (existing) {
    if (existing.status === 'done') return existing;
    return existing;
  }
  const log: WorkoutLog = {
    id: uid(),
    date,
    sessionId: session?.id,
    kind: session?.kind ?? kind,
    title: session?.title ?? 'Eget pass',
    startedAt: Date.now(),
    swaps: {},
    notes: {},
    exerciseRpe: {},
    status: 'active',
    source: 'app',
    updatedAt: Date.now(),
  };
  await db.workoutLogs.put(log);
  if (session) await db.sessions.update(session.id, { workoutLogId: log.id, updatedAt: Date.now() });
  return log;
}

/** Tidigare set för en övning grupperade per pass (äldst först), exklusive aktuellt pass. */
export async function exerciseHistory(exerciseId: string, excludeWorkoutId?: string): Promise<SetLog[][]> {
  const sets = await db.setLogs.where('exerciseId').equals(exerciseId).filter((s) => !s.deleted && s.workoutLogId !== excludeWorkoutId).toArray();
  const groups = new Map<string, SetLog[]>();
  for (const s of sets.sort((a, b) => a.date.localeCompare(b.date) || a.setIndex - b.setIndex)) {
    groups.set(s.workoutLogId, [...(groups.get(s.workoutLogId) ?? []), s]);
  }
  return [...groups.values()].sort((a, b) => a[0].date.localeCompare(b[0].date));
}

export interface Prefill {
  last?: SetLog[];
  suggestion: WeightSuggestion;
}

export async function prefillFor(exerciseId: string, item: StrengthItem, workoutId: string, loadFactor = 1): Promise<Prefill> {
  const hist = await exerciseHistory(exerciseId, workoutId);
  const last = hist.at(-1);
  const suggestion = suggestWeight(exerciseId, item, hist);
  if (loadFactor < 1 && suggestion.weightKg) {
    const ex = exercise(exerciseId);
    const step = ex.increment || 2.5;
    // Avlastning: lättare vikt, men för assisterade övningar betyder det mer motvikt
    suggestion.weightKg = ex.assisted
      ? Math.round((suggestion.weightKg / loadFactor) / step) * step
      : Math.round((suggestion.weightKg * loadFactor) / step) * step;
    suggestion.reason = 'Lättare vikt den här veckan 💆‍♀️';
  }
  return { last, suggestion };
}

export async function saveSet(set: SetLog) {
  await db.setLogs.put({ ...set, updatedAt: Date.now() });
}

export async function deleteSet(id: string) {
  const s = await db.setLogs.get(id);
  if (s) await db.setLogs.put({ ...s, deleted: true, updatedAt: Date.now() });
}

/**
 * Kontrollera om ett klart set är ett PR. Returnerar nya PR:s.
 * - heaviest: tyngsta vikt (minst 1 rep)
 * - mostReps: flest reps vid en viss vikt
 * - longestHold: längsta håll i sekunder
 * - lowestAssist: lägsta motvikt (assisterade övningar)
 */
export async function detectPrs(set: SetLog): Promise<PR[]> {
  if (!set.done) return [];
  const ex = exercise(set.exerciseId);
  const prev = await db.setLogs
    .where('exerciseId')
    .equals(set.exerciseId)
    .filter((s) => s.done && !s.deleted && s.id !== set.id)
    .toArray();
  if (!prev.length) return []; // första gången är inget PR – det är startvärdet
  const out: PR[] = [];
  const mk = (kind: PR['kind'], value: number, weightKg?: number): PR => ({
    id: `${set.exerciseId}:${kind}${weightKg != null ? ':' + weightKg : ''}`,
    exerciseId: set.exerciseId,
    kind,
    value,
    weightKg,
    date: set.date,
    setLogId: set.id,
    updatedAt: Date.now(),
  });
  if (ex.unit === 'seconds') {
    const best = Math.max(...prev.map((p) => p.seconds ?? 0));
    if ((set.seconds ?? 0) > best) out.push(mk('longestHold', set.seconds!));
  } else if (ex.assisted) {
    const withReps = prev.filter((p) => (p.reps ?? 0) >= (set.reps ?? 0));
    const best = Math.min(...withReps.map((p) => p.assistKg ?? Infinity));
    if (set.assistKg != null && (set.reps ?? 0) > 0 && set.assistKg < best) out.push(mk('lowestAssist', set.assistKg));
  } else if (!ex.bodyweight && set.weightKg) {
    const heaviest = Math.max(...prev.map((p) => p.weightKg ?? 0));
    if (set.weightKg > heaviest && (set.reps ?? 0) >= 1) out.push(mk('heaviest', set.weightKg));
    const sameW = prev.filter((p) => p.weightKg === set.weightKg);
    if (sameW.length && (set.reps ?? 0) > Math.max(...sameW.map((p) => p.reps ?? 0))) out.push(mk('mostReps', set.reps!, set.weightKg));
  } else if (ex.bodyweight && set.reps) {
    const best = Math.max(...prev.map((p) => p.reps ?? 0));
    if (set.reps > best) out.push(mk('mostReps', set.reps));
  }
  if (out.length) await db.prs.bulkPut(out);
  return out;
}

export async function finishWorkout(id: string) {
  const w = await db.workoutLogs.get(id);
  if (!w) return;
  await db.workoutLogs.put({ ...w, status: 'done', finishedAt: Date.now(), updatedAt: Date.now() });
  if (w.sessionId) await db.sessions.update(w.sessionId, { status: 'done', workoutLogId: id, updatedAt: Date.now() });
}

export async function workoutSummary(id: string) {
  const w = await db.workoutLogs.get(id);
  const sets = await db.setLogs.where('workoutLogId').equals(id).filter((s) => s.done && !s.deleted).toArray();
  const volume = sets.reduce((s, x) => s + (x.weightKg ?? 0) * (x.reps ?? 0), 0);
  const prs = await db.prs.filter((p) => sets.some((s) => s.id === p.setLogId)).toArray();
  const minutes = w ? Math.round(((w.finishedAt ?? Date.now()) - w.startedAt) / 60000) : 0;
  return { workout: w, sets: sets.length, volume, prs, minutes };
}
