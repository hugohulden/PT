import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { ensureInitialized } from '../db/repo';
import { DEFAULT_SETTINGS as S } from './settings';
import { generatePlan } from './plan/generator';
import { updateFile, weekFile } from './garminExport';
import { evaluateBadges } from './badges';

const blocks = (text: string) => [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));

describe('Garmin-fil', () => {
  const plan = generatePlan(S);

  it('V6: gym A torsdag och långpass söndag med pulstak 150, ingen simning', () => {
    const f = weekFile(plan, [6], S);
    expect(f.filename).toBe('garmin-vecka-06.md');
    const specs = blocks(f.text);
    expect(specs.map((x) => x.date)).toEqual(['2026-11-26', '2026-11-29']);
    const long = specs.find((x) => x.type === 'running');
    expect(long.tool).toBe('create_run_workout');
    expect(long.args.hr_max).toBe(150);
    expect(long.name).toBe('RK V06 Sön – Långpass 10–12 km');
    expect(f.text).toMatch(/Kontrollera först/);
    expect(f.text).not.toMatch(/swim/i);
  });

  it('kvalitetspass blir intervaller med pulstak 154–170 och styrka har Garmin-nycklar', () => {
    const specs = blocks(weekFile(plan, [16], S).text);
    const q = specs.find((x) => x.name.includes('Tor'));
    expect(q.tool).toBe('create_run_interval_workout');
    expect(q.args).toMatchObject({ repeats: 5, rep_seconds: 240, hr_min: 154, hr_max: 170 });
    const gym = specs.find((x) => x.type === 'strength');
    expect(gym.args.exercises[0]).toMatchObject({ name: 'BARBELL_BACK_SQUAT', category: 'SQUAT' });
    for (const e of gym.args.exercises) expect(e.name).not.toMatch(/HIP_THRUST/);
  });

  it('två veckor i samma fil', () => {
    const f = weekFile(plan, [7, 8], S);
    expect(f.filename).toBe('garmin-vecka-07-08.md');
    expect(blocks(f.text)).toHaveLength(10);
  });

  it('uppdateringsfil: flyttat pass ersätts, överhoppat tas bort', () => {
    const long = plan.find((x) => x.id === 'w07-long')!;
    const easy = plan.find((x) => x.id === 'w07-easy')!;
    const moved = { ...long, date: '2026-12-05', garminName: 'RK V07 Lör – Långpass 12 km', garminExported: { name: long.garminName!, date: long.date, at: 1 } };
    const skipped = { ...easy, status: 'skipped' as const, garminExported: { name: easy.garminName!, date: easy.date, at: 1 } };
    const ops = blocks(updateFile([moved, skipped], 7).text)[0];
    expect(ops[0]).toMatchObject({ åtgärd: 'ersätt', gammalt_namn: 'RK V07 Sön – Långpass 12 km', gammalt_datum: '2026-12-06' });
    expect(ops[0].nytt_pass.date).toBe('2026-12-05');
    expect(ops[1]).toMatchObject({ åtgärd: 'ta_bort', gammalt_namn: easy.garminName });
  });
});

describe('märken', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInitialized();
  });
  it('30 s dead hang och 7 dagar steg', async () => {
    await db.setLogs.put({ id: 'a', workoutLogId: 'w', exerciseId: 'dead-hang', setIndex: 0, seconds: 31, done: true, date: '2026-12-01', source: 'app', updatedAt: 0 });
    for (let i = 1; i <= 7; i++) await db.health.put({ date: `2026-12-0${i}`, steps: 12000, updatedAt: 0 });
    const got = (await evaluateBadges()).map((b) => b.id);
    expect(got).toContain('pu-hang30');
    expect(got).toContain('steps-7');
    expect(await evaluateBadges()).toEqual([]); // inte två gånger
  });
});
