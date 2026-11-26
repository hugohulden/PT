import { db } from '../db/db';
import { getSettings } from '../db/repo';
import { addDays, mondayOf, today, weekDates, weekNumber, type ISODate } from './dates';
import type { Badge } from './types';
import { isSickDay } from './illness';

export interface BadgeDef {
  id: string;
  icon: string;
  name: string;
  desc: string;
  group: 'pullup' | 'steg' | 'löpning' | 'gym' | 'vecka';
}

export const BADGES: BadgeDef[] = [
  { id: 'pu-hang30', icon: '🙌', name: '30 s dead hang', desc: 'Häng i 30 sekunder i ett svep', group: 'pullup' },
  { id: 'pu-flexed15', icon: '💪', name: '15 s böjda armar', desc: 'Håll hakan över stången i 15 s', group: 'pullup' },
  { id: 'pu-neg3x5', icon: '🐢', name: '3 × 5 s negativa', desc: 'Tre set negativa med minst 5 s ner', group: 'pullup' },
  { id: 'pu-assist10', icon: '🪶', name: 'Motvikt ≤ 10 kg', desc: 'Assisterad pull-up med högst 10 kg hjälp', group: 'pullup' },
  { id: 'pu-first', icon: '🎉', name: 'FÖRSTA PULL-UPEN', desc: 'En hel pull-up utan hjälp!', group: 'pullup' },
  { id: 'steps-7', icon: '👟', name: '7 dagar i rad', desc: 'Stegmålet sju dagar i rad', group: 'steg' },
  { id: 'steps-30', icon: '🔥', name: '30 dagar i rad', desc: 'Stegmålet en hel månad', group: 'steg' },
  { id: 'steps-100k', icon: '💯', name: '100 000 steg/vecka', desc: 'Minst 100 000 steg på en vecka', group: 'steg' },
  { id: 'run-calm-week', icon: '💗', name: 'Lugn hela veckan', desc: 'Alla lugna pass och långpass inom pulstaket', group: 'löpning' },
  { id: 'run-15', icon: '🏃‍♀️', name: '15 km lugnt', desc: 'Långpass på 15 km inom pulstaket', group: 'löpning' },
  { id: 'run-20', icon: '🌟', name: '20 km', desc: 'Längsta långpasset före loppet', group: 'löpning' },
  { id: 'race', icon: '🏁', name: 'Göteborgsvarvet', desc: 'Du gjorde det!', group: 'löpning' },
  { id: 'gym-first-pr', icon: '🏆', name: 'Första rekordet', desc: 'Ditt första PR i appen', group: 'gym' },
  { id: 'gym-10', icon: '🍑', name: '10 gympass', desc: 'Tio loggade gympass', group: 'gym' },
  { id: 'week-complete', icon: '✨', name: 'Hel vecka', desc: 'Alla veckans pass klara', group: 'vecka' },
];

export const BADGE_MAP = Object.fromEntries(BADGES.map((b) => [b.id, b]));

/** Gå igenom datan och dela ut nya märken. Returnerar de nya. */
export async function evaluateBadges(): Promise<BadgeDef[]> {
  const s = await getSettings();
  const have = new Set((await db.badges.toArray()).map((b) => b.id));
  const earned: { id: string; date: ISODate; detail?: string }[] = [];
  const give = (id: string, date: ISODate, detail?: string) => {
    if (!have.has(id) && !earned.some((e) => e.id === id)) earned.push({ id, date, detail });
  };

  const sets = (await db.setLogs.filter((x) => x.done && !x.deleted).toArray()).sort((a, b) => a.date.localeCompare(b.date));
  for (const x of sets) {
    if (x.exerciseId === 'dead-hang' && (x.seconds ?? 0) >= 30) give('pu-hang30', x.date);
    if (x.exerciseId === 'flexed-hang' && (x.seconds ?? 0) >= 15) give('pu-flexed15', x.date);
    if (x.exerciseId === 'assisted-pullup' && x.assistKg != null && x.assistKg <= 10 && (x.reps ?? 0) >= 1) give('pu-assist10', x.date);
    if (x.exerciseId === 'pullup' && (x.reps ?? 0) >= 1) give('pu-first', x.date);
  }
  const negByWorkout = new Map<string, number>();
  for (const x of sets) if (x.exerciseId === 'negative-pullup' && (x.seconds ?? 0) >= 5) negByWorkout.set(x.workoutLogId, (negByWorkout.get(x.workoutLogId) ?? 0) + 1);
  for (const [w, n] of negByWorkout) if (n >= 3) give('pu-neg3x5', sets.find((x) => x.workoutLogId === w)!.date);

  // Steg
  const health = (await db.health.toArray()).sort((a, b) => a.date.localeCompare(b.date));
  // Sjukdagar bryter inte sviten
  const ill = (await db.illness.toArray()).filter((i) => !i.deleted);
  let streak = 0;
  let prev: string | undefined;
  for (const h of health) {
    if (isSickDay(h.date, ill) && (h.steps ?? 0) < s.steps.goal) {
      if (prev) prev = h.date;
      continue;
    }
    const ok = (h.steps ?? 0) >= s.steps.goal;
    streak = ok ? (prev && addDays(prev, 1) === h.date ? streak + 1 : 1) : 0;
    prev = ok ? h.date : undefined;
    if (streak >= 7) give('steps-7', h.date);
    if (streak >= 30) give('steps-30', h.date);
  }
  const byWeek = new Map<string, number>();
  for (const h of health) byWeek.set(mondayOf(h.date), (byWeek.get(mondayOf(h.date)) ?? 0) + (h.steps ?? 0));
  for (const [mon, total] of byWeek) if (total >= 100_000) give('steps-100k', addDays(mon, 6));

  // Löpning
  const acts = await db.activities.where('type').equals('running').toArray();
  for (const a of acts) {
    if ((a.distanceKm ?? 0) >= 14.8 && a.withinCap) give('run-15', a.date);
    if ((a.distanceKm ?? 0) >= 19.8) give('run-20', a.date);
  }
  const sessions = await db.sessions.toArray();
  if (sessions.some((x) => x.kind === 'race' && x.status === 'done')) give('race', s.raceDate);
  const t = today();
  for (let w = s.restartWeek; w <= weekNumber(t, s.week1Start); w++) {
    const days = weekDates(w, s.week1Start);
    if (days[6] >= t) continue; // bara avslutade veckor
    const ws = sessions.filter((x) => x.week === w);
    const real = ws.filter((x) => x.kind !== 'rest' && x.status !== 'skipped');
    if (real.length && real.every((x) => x.status === 'done')) give('week-complete', days[6], `V${w}`);
    const calm = ws.filter((x) => (x.kind === 'easy' || x.kind === 'long') && x.activityId);
    if (calm.length >= 2) {
      const linked = calm.map((x) => acts.find((a) => a.id === x.activityId));
      if (linked.every((a) => a?.withinCap)) give('run-calm-week', days[6], `V${w}`);
    }
  }

  // Gym
  if (await db.prs.count()) give('gym-first-pr', (await db.prs.orderBy('date').first())!.date);
  const gyms = await db.workoutLogs.filter((x) => x.status === 'done' && !x.deleted && !x.beforeApp).toArray();
  if (gyms.length >= 10) give('gym-10', gyms.sort((a, b) => a.date.localeCompare(b.date))[9].date);

  if (!earned.length) return [];
  const now = Date.now();
  await db.badges.bulkPut(earned.map<Badge>((e) => ({ id: e.id, date: e.date, detail: e.detail, earnedAt: now })));
  return earned.map((e) => BADGE_MAP[e.id]);
}
