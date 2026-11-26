import { addDays, dayShort, isoWeekday, pad2, weekStart, type ISODate } from '../dates';
import type { Phase, PlannedSession, SessionKind, Settings } from '../types';
import { buildStrength } from './strength';
import { easyRun, longRun, qualityRun, qualityTitle } from './running';
import { EASY_KM, LONG_KM, LONG_TEXT, QUALITY, SWIM_IDEAS, swimTarget } from './tables';

export function phaseOf(s: Settings, week: number): Phase | undefined {
  return s.phases.find((p) => week >= p.fromWeek && week <= p.toWeek);
}

export const isDeload = (s: Settings, week: number) => s.deloadWeeks.includes(week);
export const isPullupTest = (s: Settings, week: number) => s.pullupTestWeeks.includes(week);

export function garminName(week: number, date: ISODate, label: string) {
  return `RK V${pad2(week)} ${dayShort(date)} – ${label}`;
}

const TITLES: Partial<Record<SessionKind, string>> = {
  gymA: 'Gym A – Ben & rumpa',
  gymB: 'Gym B – Rygg & mage',
  gymExtra: 'Extrapass – Bröst, axlar & triceps',
  gymFull: 'Lätt helkropp',
  activation: 'Aktivering på gymmet',
  easy: 'Lugn löpning',
  quality: 'Kvalitetslöpning',
  long: 'Långpass',
  swim: 'Simning',
  rest: 'Vila – promenaddag 🚶‍♀️',
  race: 'GÖTEBORGSVARVET 🏁',
};

type Slot = { kind: SessionKind; weekday: number; title?: string; subtitle?: string; build?: () => Partial<PlannedSession> };

function session(s: Settings, week: number, slot: Slot): PlannedSession {
  const date = addDays(weekStart(week, s.week1Start), slot.weekday - 1);
  const extra = slot.build?.() ?? {};
  const type: PlannedSession['type'] = extra.run
    ? 'running'
    : extra.strength
      ? 'strength'
      : slot.kind === 'swim'
        ? 'swimming'
        : slot.kind === 'race'
          ? 'running'
          : 'rest';
  const title = slot.title ?? TITLES[slot.kind] ?? slot.kind;
  const sendToGarmin = type === 'running' || type === 'strength';
  return {
    id: `w${pad2(week)}-${slot.kind}`,
    week,
    date,
    originalDate: date,
    type,
    kind: slot.kind,
    title,
    subtitle: slot.subtitle,
    status: 'planned',
    garminName: sendToGarmin && slot.kind !== 'race' ? garminName(week, date, shortLabel(slot.kind, extra, title)) : undefined,
    updatedAt: 0,
    ...extra,
  };
}

function shortLabel(kind: SessionKind, extra: Partial<PlannedSession>, title: string): string {
  if (kind === 'quality' && extra.run) return extra.run.distanceText ?? 'Kvalitet';
  if (kind === 'long' && extra.run) return `Långpass ${extra.run.distanceText}`;
  if (kind === 'easy' && extra.run) return `Lugnt ${extra.run.distanceText}`;
  if (kind === 'gymA') return 'Gym A Ben & rumpa';
  if (kind === 'gymB') return 'Gym B Rygg & mage';
  return title;
}

export function generateWeek(s: Settings, week: number): PlannedSession[] {
  return uniqueIds(generateWeekRaw(s, week));
}

/** Två pass av samma sort i en vecka (t.ex. två vilodagar) får veckodagen i id:t. */
function uniqueIds(list: PlannedSession[]): PlannedSession[] {
  const count = new Map<string, number>();
  for (const x of list) count.set(x.id, (count.get(x.id) ?? 0) + 1);
  return list.map((x) => ((count.get(x.id) ?? 0) > 1 ? { ...x, id: `${x.id}-${isoWeekday(x.date)}` } : x));
}

function generateWeekRaw(s: Settings, week: number): PlannedSession[] {
  const phase = phaseOf(s, week);
  if (!phase) return [];
  const wd = s.weekdays;
  const deload = isDeload(s, week);
  const test = isPullupTest(s, week);
  const strength = (kind: SessionKind, light = false) => () => ({
    strength: buildStrength(kind, phase.key, week, { deload, pullupTest: test && (kind === 'gymA' || kind === 'gymFull'), light }),
  });
  const swimSlot = (subtitle?: string): Slot => ({
    kind: 'swim',
    weekday: wd.swim,
    subtitle: subtitle ?? 'Din egen planering – återhämtning för benen inför långpasset',
    build: () => ({ swim: { targetM: swimTarget(week, deload), suggestion: SWIM_IDEAS[week % SWIM_IDEAS.length] } }),
  });
  const restSlot = (title?: string): Slot => ({ kind: 'rest', weekday: wd.rest, title });

  // --- Specialveckor ---
  if (week === s.restartWeek) {
    // Mån–ons är redan förbi. Lätt resten av veckan.
    return [
      { kind: 'gymA' as const, weekday: 4, subtitle: 'Lätt omstart – testa loggningen', build: strength('gymA', true) },
      swimSlot('Simning eller 5 km lugnt – välj det som känns bäst'),
      { kind: 'long' as const, weekday: wd.long, subtitle: 'Max puls 150!', build: () => ({ run: longRun(s, LONG_KM[week], LONG_TEXT[week]) }) },
      restSlot(),
    ].map((sl) => session(s, week, sl));
  }

  if (week === s.raceWeek) {
    return [
      { kind: 'activation' as const, weekday: 1, build: strength('activation') },
      { kind: 'easy' as const, weekday: 2, title: 'Lugnt 30 min + stegringar', build: () => ({ run: easyRun(s, 0, { minutes: 30, strides: 4 }) }) },
      { kind: 'rest' as const, weekday: 3, title: 'Vila' },
      { kind: 'quality' as const, weekday: 4, title: '20 min jogg + 3 stegringar', build: () => ({ run: easyRun(s, 0, { minutes: 20, strides: 3 }) }) },
      { kind: 'swim' as const, weekday: 5, title: 'Vila eller lätt simning', build: () => ({ swim: { targetM: 800, suggestion: 'Helt valfritt: 15–20 min lugn simning.' } }) },
      {
        kind: 'race' as const,
        weekday: 6,
        subtitle: '21,1 km – du har tränat för det här! 💖',
        build: () => ({
          run: { ...longRun(s, 21.1), description: 'Starta lugnt – första 5 km ska kännas för lätta. Ha kul!' },
        }),
      },
      { kind: 'rest' as const, weekday: 7, title: 'Återhämtningspromenad 🚶‍♀️' },
    ].map((sl) => session(s, week, sl));
  }

  const slots: Slot[] = [];
  // Måndag
  if (phase.key === 'taper' && week === s.raceWeek - 1) {
    slots.push({ kind: 'gymFull', weekday: wd.gymA, build: strength('gymFull') });
  } else {
    slots.push({ kind: 'gymA', weekday: wd.gymA, build: strength('gymA') });
  }
  // Tisdag
  slots.push({ kind: 'easy', weekday: wd.easy, build: () => ({ run: easyRun(s, EASY_KM[week]) }) });
  // Onsdag
  if (!(phase.key === 'taper' && week === s.raceWeek - 1)) {
    slots.push({ kind: 'gymB', weekday: wd.gymB, build: strength('gymB') });
  }
  // Torsdag
  const q = QUALITY[week];
  if (q) {
    slots.push({ kind: 'quality', weekday: wd.quality, title: `Kvalitet: ${qualityTitle(q)}`, build: () => ({ run: qualityRun(s, week) }) });
  }
  // Fredag, lördag, söndag
  slots.push(swimSlot());
  slots.push({ kind: 'long', weekday: wd.long, build: () => ({ run: longRun(s, LONG_KM[week]) }) });
  slots.push(restSlot());

  return slots.map((sl) => session(s, week, sl));
}

export function generatePlan(s: Settings): PlannedSession[] {
  const out: PlannedSession[] = [];
  for (let w = s.restartWeek; w <= s.raceWeek; w++) out.push(...generateWeek(s, w));
  return out;
}

/** Löpvolym (km) som planen räknar med för en vecka. */
export function plannedRunKm(sessions: PlannedSession[]): number {
  return +sessions.reduce((sum, x) => sum + (x.run?.estKm ?? 0), 0).toFixed(1);
}

/**
 * Slår ihop en ny genererad plan med befintliga pass: pass som är klara,
 * flyttade eller ändrade av henne behålls.
 */
export function mergePlan(generated: PlannedSession[], existing: PlannedSession[]): PlannedSession[] {
  const byId = new Map(existing.map((x) => [x.id, x]));
  const out = generated.map((g) => {
    const e = byId.get(g.id);
    if (!e) return g;
    byId.delete(g.id);
    if (e.userModified || e.status !== 'planned' || e.adjustment) return e;
    // Skickat till Garmin och nu på annan dag/med annat innehåll → behöver uppdateringsfil
    const changed = !!e.garminExported && (e.garminExported.date !== g.date || e.garminExported.name !== g.garminName || JSON.stringify(e.run) !== JSON.stringify(g.run));
    return { ...g, garminExported: e.garminExported, garminDirty: e.garminDirty || changed, updatedAt: e.updatedAt };
  });
  // Egna pass (t.ex. tillagt extrapass) som inte finns i generatorn
  for (const e of byId.values()) if (e.userModified) out.push(e);
  return out.sort((a, b) => a.date.localeCompare(b.date));
}
