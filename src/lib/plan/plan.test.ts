import { describe, expect, it } from 'vitest';
import { Profile } from '@garmin/fitsdk';
import { dayName, isoWeekday, weekNumber, weekStart, diffDays } from '../dates';
import { DEFAULT_SETTINGS as S } from '../settings';
import { generatePlan, generateWeek, mergePlan, phaseOf, plannedRunKm } from './generator';
import { EXERCISES, alternativesFor } from '../exercises';
import { applyReadiness, capVerdict, readinessCheck, scheduleWarnings, suggestWeight } from '../rules';
import type { SetLog } from '../types';

describe('datum och veckonummer', () => {
  it('V1 börjar måndag 19 okt 2026', () => {
    expect(isoWeekday('2026-10-19')).toBe(1);
    expect(weekNumber('2026-10-19', S.week1Start)).toBe(1);
  });
  it('V6 = 23 nov, V7 = 30 nov, V31 = 17 maj', () => {
    expect(weekStart(6, S.week1Start)).toBe('2026-11-23');
    expect(weekStart(7, S.week1Start)).toBe('2026-11-30');
    expect(weekStart(31, S.week1Start)).toBe('2027-05-17');
    expect(weekNumber('2026-11-25', S.week1Start)).toBe(6);
    expect(weekNumber('2026-11-29', S.week1Start)).toBe(6);
    expect(weekNumber('2026-11-30', S.week1Start)).toBe(7);
  });
  it('loppet är lördag 22 maj 2027 i V31', () => {
    expect(dayName(S.raceDate)).toBe('lördag');
    expect(weekNumber(S.raceDate, S.week1Start)).toBe(31);
  });
  it('178 dagar kvar från 25 nov', () => {
    expect(diffDays(S.raceDate, '2026-11-25')).toBe(178);
  });
  it('sommartid flyttar inga datum (mars 2027)', () => {
    expect(weekStart(23, S.week1Start)).toBe('2027-03-22');
    expect(weekStart(24, S.week1Start)).toBe('2027-03-29');
  });
  it('faserna stämmer', () => {
    expect(weekStart(15, S.week1Start)).toBe('2027-01-25');
    expect(weekStart(29, S.week1Start)).toBe('2027-05-03');
    expect(phaseOf(S, 6)?.key).toBe('restart');
    expect(phaseOf(S, 14)?.key).toBe('base');
    expect(phaseOf(S, 22)?.key).toBe('build');
    expect(phaseOf(S, 28)?.key).toBe('specific');
    expect(phaseOf(S, 31)?.key).toBe('taper');
  });
});

describe('plangenerator', () => {
  const plan = generatePlan(S);

  it('V6 innehåller bara tors–sön', () => {
    const v6 = plan.filter((p) => p.week === 6);
    expect(v6.map((p) => p.date)).toEqual(['2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29']);
    const long = v6.find((p) => p.kind === 'long')!;
    expect(long.run!.hr[1]).toBe(150);
  });

  it('söndagar är vila hela vägen', () => {
    for (const p of plan) if (isoWeekday(p.date) === 7) expect(p.kind).toBe('rest');
  });

  it('alla pass-id är unika', () => {
    expect(new Set(plan.map((p) => p.id)).size).toBe(plan.length);
  });

  it('loppet ligger på loppdagen', () => {
    const race = plan.find((p) => p.kind === 'race')!;
    expect(race.date).toBe('2027-05-22');
  });

  it('långpassen följer tabellen och har puls 125–150', () => {
    const longs = plan.filter((p) => p.kind === 'long');
    expect(longs.find((p) => p.week === 27)!.run!.distanceKm).toBe(20);
    expect(longs.find((p) => p.week === 10)!.run!.distanceKm).toBe(10);
    for (const l of longs) expect(l.run!.hr).toEqual([125, 150]);
  });

  it('inga intervaller över 170', () => {
    for (const p of plan) if (p.run) expect(p.run.hr[1]).toBeLessThanOrEqual(170);
  });

  it('veckovolymen ökar högst ~10 % (utom efter avlastning och omstart)', () => {
    for (let w = 8; w <= 28; w++) {
      if (S.deloadWeeks.includes(w - 1)) continue;
      const prev = plannedRunKm(plan.filter((p) => p.week === w - 1));
      const cur = plannedRunKm(plan.filter((p) => p.week === w));
      expect(cur, `V${w}: ${cur} km mot ${prev} km`).toBeLessThanOrEqual(prev * 1.12);
    }
  });

  it('avlastningsveckor har mindre volym', () => {
    for (const w of S.deloadWeeks) {
      const prev = plannedRunKm(plan.filter((p) => p.week === w - 1));
      const cur = plannedRunKm(plan.filter((p) => p.week === w));
      expect(cur).toBeLessThan(prev * 0.85);
    }
  });

  it('pull-up-test i testveckorna', () => {
    for (const w of [10, 14, 18, 22, 26, 30]) {
      const s = plan.find((p) => p.week === w && (p.kind === 'gymA' || p.kind === 'gymFull'))!;
      expect(s.strength!.pullupTest, `V${w}`).toBe(true);
    }
  });

  it('simpass skickas aldrig till Garmin', () => {
    for (const p of plan) if (p.kind === 'swim') expect(p.garminName).toBeUndefined();
  });

  it('Garmin-namn har prefix RK Vxx', () => {
    const q = plan.find((p) => p.week === 7 && p.kind === 'quality')!;
    expect(q.garminName).toMatch(/^RK V07 Tor – /);
  });

  it('ingen hip thrust någonstans', () => {
    for (const p of plan) for (const i of p.strength?.items ?? []) expect(['hip-thrust', 'barbell-glute-bridge']).not.toContain(i.exerciseId);
    for (const e of EXERCISES) for (const a of alternativesFor(e.id)) expect(a.excluded).toBeFalsy();
  });

  it('mergePlan behåller flyttade och klara pass', () => {
    const v7 = generateWeek(S, 7);
    const moved = { ...v7[1], date: '2026-12-02', userModified: true, status: 'moved' as const };
    const merged = mergePlan(v7, [moved]);
    expect(merged.find((x) => x.id === moved.id)!.date).toBe('2026-12-02');
  });
});

describe('Garmin-nycklar', () => {
  const toSnake = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/([A-Z])([A-Z][a-z])/g, '$1_$2').toUpperCase();
  const T = Profile.types as Record<string, Record<string, string>>;
  const categories = new Set(Object.values(T.exerciseCategory).map(toSnake));
  it('alla övningsnycklar finns i FIT SDK', () => {
    for (const e of EXERCISES) {
      expect(categories.has(e.garmin.category), `${e.id}: ${e.garmin.category}`).toBe(true);
      if (!e.garmin.name) continue;
      const camel = e.garmin.category.toLowerCase().replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      const names = Object.values(T[`${camel}ExerciseName`] ?? {}).map(toSnake);
      expect(names, `${e.id}: ${e.garmin.category}/${e.garmin.name}`).toContain(e.garmin.name);
    }
  });
});

describe('regler', () => {
  it('varnar för tungt benpass dagen före långpasset', () => {
    const w = generateWeek(S, 8).map((p) => (p.kind === 'gymA' ? { ...p, date: '2026-12-11' } : p));
    expect(scheduleWarnings(w).join(' ')).toMatch(/långpasset/);
  });
  it('standardveckan ger inga varningar', () => {
    expect(scheduleWarnings(generateWeek(S, 8))).toEqual([]);
  });
  it('pulstak-omdöme', () => {
    expect(capVerdict('easy', 140, S)!.ok).toBe(true);
    expect(capVerdict('long', 161, S)!.text).toMatch(/Snittpuls 161, målet var max 150/);
  });
  it('dagsform: sömn, vilopuls, HRV', () => {
    const r = readinessCheck({ date: '2026-12-02', sleepH: 5.5, restingHr: 53, hrvStatus: 'UNBALANCED', updatedAt: 0 }, [{ date: '2026-12-01', hrvStatus: 'UNBALANCED', updatedAt: 0 }], S.readiness);
    expect(r.map((x) => x.rule).sort()).toEqual(['hrv', 'rhr', 'sleep']);
  });
  it('kort sömn kortar ett löppass', () => {
    const long = generateWeek(S, 9).find((p) => p.kind === 'long')!;
    const adj = applyReadiness(long, { rule: 'sleep', action: 'shorten', title: '', text: '' }, S)!;
    expect(adj.run!.estKm).toBeLessThan(long.run!.estKm);
    expect(adj.adjustment!.original.run).toEqual(long.run);
  });
  it('dubbel progression', () => {
    const mk = (w: number, reps: number[]): SetLog[] =>
      reps.map((r, i) => ({ id: `${w}${i}`, workoutLogId: 'x', exerciseId: 'squat', setIndex: i, weightKg: w, reps: r, done: true, date: '2026-12-01', source: 'app', updatedAt: 0 }));
    const item = { sets: 4, repMin: 8, repMax: 10 };
    expect(suggestWeight('squat', item, [mk(40, [10, 10, 10, 10])])).toMatchObject({ direction: 'up', weightKg: 42.5 });
    expect(suggestWeight('squat', item, [mk(40, [7, 8, 8, 8]), mk(40, [7, 7, 8, 8])])).toMatchObject({ direction: 'down', weightKg: 37.5 });
    expect(suggestWeight('squat', item, [mk(40, [9, 9, 8, 8])])).toMatchObject({ direction: 'same', weightKg: 40 });
  });
});
