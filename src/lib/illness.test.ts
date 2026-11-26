import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { ensureInitialized } from '../db/repo';
import { activeIllness, cancelIllness, easeDays, endIllness, isSickDay, pauseSessionsWhileSick, startIllness } from './illness';
import { stepStreak } from '../pages/Today';

const setToday = (d: string) => vi.setSystemTime(new Date(`${d}T10:00:00`));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  setToday('2026-12-02'); // ons V7
  await db.delete();
  await db.open();
  await ensureInitialized();
});
afterEach(() => vi.useRealTimers());

describe('sjuk', () => {
  it('pausar pass från första sjukdagen till idag, och dag för dag medan hon är sjuk', async () => {
    const n = await startIllness('2026-11-30', 'fever');
    expect(n).toBe(3); // mån gym A, tis lugnt, ons gym B
    const gymA = await db.sessions.get('w07-gymA');
    expect(gymA).toMatchObject({ status: 'skipped', adjustment: { rule: 'sick' } });
    expect((await db.sessions.get('w07-quality'))!.status).toBe('planned'); // imorgon, inte pausat än

    setToday('2026-12-03');
    expect(await pauseSessionsWhileSick()).toBe(1);
    expect((await db.sessions.get('w07-quality'))!.status).toBe('skipped');
  });

  it('frisk igen: lugn återgång gör kommande pass lättare och tar bort intervaller', async () => {
    await startIllness('2026-11-30', 'fever');
    setToday('2026-12-04'); // fre – frisk idag
    await pauseSessionsWhileSick();
    const r = await endIllness({ ease: true });
    expect(r.days).toBe(4); // 30 nov – 3 dec
    expect(easeDays(4, 'fever')).toBe(6);
    expect(await activeIllness()).toBeUndefined();
    const long = (await db.sessions.get('w07-long'))!;
    expect(long.adjustment?.rule).toBe('sick');
    expect(long.run!.estKm).toBeLessThan(12);
    const q = (await db.sessions.get('w08-quality'))!; // tor 10 dec, utanför 6 dagar
    expect(q.adjustment).toBeUndefined();
    const easyNext = (await db.sessions.get('w08-easy'))!; // tis 8 dec, inom 6 dagar
    expect(easyNext.adjustment?.rule).toBe('sick');
  });

  it('ångra sjukanmälan återställer passen', async () => {
    await startIllness('2026-12-01', 'mild');
    await cancelIllness();
    expect((await db.sessions.get('w07-easy'))!.status).toBe('planned');
    expect(await activeIllness()).toBeUndefined();
  });

  it('sjukdagar bryter inte stegsviten', () => {
    const days = [
      { date: '2026-11-27', steps: 12000 },
      { date: '2026-11-28', steps: 12000 },
      { date: '2026-11-29', steps: 3000 }, // sjuk
      { date: '2026-11-30', steps: 2000 }, // sjuk
      { date: '2026-12-01', steps: 11000 },
    ];
    const ill = [{ id: 'x', from: '2026-11-29', to: '2026-11-30', level: 'mild' as const, updatedAt: 0 }];
    expect(stepStreak(days, 10000, '2026-12-01', (d) => isSickDay(d, ill, '2026-12-01'))).toBe(3);
    expect(stepStreak(days, 10000, '2026-12-01')).toBe(1);
  });
});
