import { db, uid } from '../db/db';
import { getSettings } from '../db/repo';
import { addDays, diffDays, today, type ISODate } from './dates';
import { applyReadiness } from './rules';
import type { Illness, PlannedSession } from './types';

// Sjukdom: passen pausas från första sjukdagen, och när hon är frisk igen
// blir de första dagarna lättare (inga intervaller, kortare pass).

export async function activeIllness(): Promise<Illness | undefined> {
  return (await db.illness.toArray()).find((i) => !i.to && !i.deleted);
}

export async function illnessPeriods(): Promise<Illness[]> {
  return (await db.illness.toArray()).filter((i) => !i.deleted);
}

/** Var hon sjuk den här dagen? */
export function isSickDay(date: ISODate, periods: Illness[], todayD: ISODate = today()): boolean {
  return periods.some((p) => !p.deleted && date >= p.from && date <= (p.to ?? todayD));
}

function sickAdjustment(s: PlannedSession, reason: string): PlannedSession {
  return {
    ...s,
    status: 'skipped',
    adjustment: { reason, rule: 'sick', appliedAt: Date.now(), original: { title: s.title, kind: s.kind, run: s.run, strength: s.strength } },
    garminDirty: s.garminExported ? true : s.garminDirty,
    userModified: true,
    updatedAt: Date.now(),
  };
}

/** Pausa planerade pass från första sjukdagen till och med idag. Körs också varje gång appen öppnas. */
export async function pauseSessionsWhileSick(): Promise<number> {
  const ill = await activeIllness();
  if (!ill) return 0;
  const t = today();
  const list = await db.sessions.where('date').between(ill.from, t, true, true).toArray();
  const todo = list.filter((s) => s.status === 'planned' || s.status === 'moved').filter((s) => s.kind !== 'rest');
  if (todo.length) await db.sessions.bulkPut(todo.map((s) => sickAdjustment(s, 'Pausat – sjuk 🤒')));
  return todo.length;
}

export async function startIllness(from: ISODate, level: Illness['level']) {
  const cur = await activeIllness();
  await db.illness.put({ id: cur?.id ?? uid(), from, level, updatedAt: Date.now() });
  return pauseSessionsWhileSick();
}

/** Antal lätta dagar efter sjukdom: ungefär lika många som sjukdagarna, fler efter feber. */
export function easeDays(sickDays: number, level: Illness['level']): number {
  return level === 'fever' ? Math.min(10, Math.max(3, sickDays + 2)) : Math.min(5, Math.max(2, sickDays));
}

export async function endIllness(opts: { ease: boolean }): Promise<{ eased: number; days: number }> {
  const ill = await activeIllness();
  if (!ill) return { eased: 0, days: 0 };
  const t = today();
  const lastSick = addDays(t, -1) < ill.from ? ill.from : addDays(t, -1);
  // Pass idag som pausades räknas inte som sjuka om hon är frisk idag
  await db.illness.put({ ...ill, to: lastSick, updatedAt: Date.now() });
  const todays = await db.sessions.where('date').equals(t).toArray();
  for (const s of todays) {
    if (s.status === 'skipped' && s.adjustment?.rule === 'sick') {
      const o = s.adjustment.original;
      await db.sessions.put({ ...s, ...o, status: 'planned', adjustment: undefined, updatedAt: Date.now() });
    }
  }
  const days = diffDays(lastSick, ill.from) + 1;
  if (!opts.ease) return { eased: 0, days };

  const s = await getSettings();
  const n = easeDays(days, ill.level);
  const upcoming = await db.sessions.where('date').between(t, addDays(t, n - 1), true, true).toArray();
  let eased = 0;
  for (const x of upcoming) {
    if (x.status !== 'planned' && x.status !== 'moved') continue;
    if (x.kind === 'race' || x.kind === 'rest' || x.kind === 'swim') continue;
    const reason = 'Lugn återgång efter sjukdom 💖';
    const base = x.kind === 'quality' ? applyReadiness(x, { rule: 'hrv', action: 'easy', title: '', text: reason }, s) : applyReadiness(x, { rule: 'sleep', action: 'shorten', title: '', text: reason }, s);
    if (!base) continue;
    await db.sessions.put({ ...base, adjustment: { ...base.adjustment!, rule: 'sick', reason }, garminDirty: x.garminExported ? true : base.garminDirty, userModified: true, updatedAt: Date.now() });
    eased++;
  }
  return { eased, days };
}

/** Ångra sjukanmälan helt (t.ex. tryckt av misstag): passen återställs. */
export async function cancelIllness() {
  const ill = await activeIllness();
  if (!ill) return;
  await db.illness.put({ ...ill, deleted: true, updatedAt: Date.now() });
  const list = await db.sessions.where('date').aboveOrEqual(ill.from).toArray();
  for (const s of list) {
    if (s.status === 'skipped' && s.adjustment?.rule === 'sick') {
      const o = s.adjustment.original;
      await db.sessions.put({ ...s, ...o, status: s.date !== s.originalDate ? 'moved' : 'planned', adjustment: undefined, updatedAt: Date.now() });
    }
  }
}
