import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './db';
import { detectPrs, ensureInitialized, moveSession, regeneratePlan, saveSettings } from './repo';
import type { SetLog } from '../lib/types';

const set = (id: string, weightKg: number, reps: number, extra: Partial<SetLog> = {}): SetLog => ({
  id,
  workoutLogId: 'w-' + id,
  exerciseId: 'squat',
  setIndex: 0,
  weightKg,
  reps,
  done: true,
  date: '2026-12-01',
  source: 'app',
  updatedAt: 0,
  ...extra,
});

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe('PR-detektion', () => {
  it('första gången är inget PR, sedan tyngsta vikt och flest reps', async () => {
    await db.setLogs.put(set('a', 40, 8));
    expect(await detectPrs(set('a', 40, 8))).toEqual([]);
    const heavier = set('b', 42.5, 6);
    await db.setLogs.put(heavier);
    expect((await detectPrs(heavier)).map((p) => p.kind)).toEqual(['heaviest']);
    const moreReps = set('c', 40, 10);
    await db.setLogs.put(moreReps);
    expect((await detectPrs(moreReps)).map((p) => p.kind)).toEqual(['mostReps']);
  });
  it('lägre motvikt i assisterad pull-up är ett PR', async () => {
    await db.setLogs.put(set('a', 0, 6, { exerciseId: 'assisted-pullup', weightKg: undefined, assistKg: 35 }));
    const better = set('b', 0, 6, { exerciseId: 'assisted-pullup', weightKg: undefined, assistKg: 32.5 });
    await db.setLogs.put(better);
    expect((await detectPrs(better)).map((p) => p.kind)).toEqual(['lowestAssist']);
  });
});

describe('plan i databasen', () => {
  it('skapar plan V6–V31 och behåller flyttade pass när inställningar ändras', async () => {
    await ensureInitialized();
    expect(await db.sessions.where('week').equals(31).count()).toBe(7);
    await moveSession('w08-easy', '2026-12-09');
    await saveSettings({ hr: { easy: [120, 148], long: [125, 150], quality: [154, 170], maxHr: 193 } });
    const moved = await db.sessions.get('w08-easy');
    expect(moved!.date).toBe('2026-12-09');
    expect(moved!.status).toBe('moved');
    const other = await db.sessions.get('w09-easy');
    expect(other!.run!.hr).toEqual([120, 148]);
    await regeneratePlan();
    expect(await db.sessions.count()).toBeGreaterThan(150);
  });
  it('lokala ändringar hamnar i utkorgen för synk', async () => {
    await ensureInitialized();
    await db.outbox.clear();
    await moveSession('w07-long', '2026-12-05');
    await new Promise((r) => setTimeout(r, 20));
    expect(await db.outbox.where({ table: 'sessions', key: 'w07-long' }).count()).toBeGreaterThan(0);
  });
});
