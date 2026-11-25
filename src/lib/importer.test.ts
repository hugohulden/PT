import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../db/db';
import { ensureInitialized } from '../db/repo';
import { applyImport, extractJson, normalizePayload, parseCsv, previewImport, resolveExercise } from './importer';

beforeEach(async () => {
  await db.delete();
  await db.open();
  await ensureInitialized();
});

const payload = {
  format: 'nellie-traning/v1',
  activities: [
    // Långpass lör 28 nov (V6) – snittpuls över taket
    { garmin_id: 111, type: 'running', start: '2026-11-28T09:00:00', distance_km: 11.2, duration_s: 5300, avg_hr: 158, max_hr: 170 },
    // Före appen
    { garmin_id: 99, type: 'running', start: '2026-11-22T09:00:00', distance_km: 15, duration_s: 7185, avg_hr: 161 },
    { garmin_id: 112, type: 'lap_swimming', start: '2026-11-27T18:00:00', distance_km: 1.3, duration_s: 2500 },
  ],
  daily: [{ date: '2026-11-28', steps: 14000, sleep_h: 7.9, resting_hr: 50, hrv: 80, hrv_status: 'BALANCED' }],
  weigh_ins: [{ date: '2026-11-28', kg: 60.4 }],
  workouts: [{ date: '2026-11-17', title: 'Ben', sets: [{ exercise: 'Knäböj', set: 1, reps: 10, weight_kg: 40 }, { exercise: 'Hip thrust', set: 1, reps: 10, weight_kg: 50 }] }],
};

describe('import', () => {
  it('läser JSON även med text och kodblock runt', () => {
    const raw = 'Här är datan:\n```json\n' + JSON.stringify(payload) + '\n```\nKlart!';
    expect((extractJson(raw) as { activities: unknown[] }).activities).toHaveLength(3);
  });

  it('importerar, matchar mot plan och ger pulstak-omdöme', async () => {
    const p = normalizePayload(payload);
    const pre = await previewImport(p, JSON.stringify(payload));
    expect(pre.activities.new).toBe(3);
    expect(pre.beforeApp).toBe(2);
    await applyImport(p, { hash: pre.hash, source: 'claude', label: 'test' });
    const long = await db.sessions.get('w06-long');
    expect(long!.status).toBe('done');
    expect(long!.activityId).toBe('garmin-111');
    const act = await db.activities.get('garmin-111');
    expect(act!.withinCap).toBe(false);
    expect(act!.capVerdict).toMatch(/Snittpuls 158, målet var max 150/);
    expect((await db.sessions.get('w06-swim'))!.status).toBe('done');
    expect((await db.activities.get('garmin-99'))!.beforeApp).toBe(true);
    expect((await db.health.get('2026-11-28'))!.steps).toBe(14000);
  });

  it('samma import två gånger skapar inga dubbletter', async () => {
    const p = normalizePayload(payload);
    await applyImport(p, { hash: 'a', source: 'json', label: '1' });
    await applyImport(p, { hash: 'a', source: 'json', label: '2' });
    expect(await db.activities.count()).toBe(3);
    expect(await db.weighIns.count()).toBe(1);
    expect(await db.workoutLogs.count()).toBe(1);
    const pre = await previewImport(p, JSON.stringify(payload));
    expect(pre.workouts.duplicate).toBe(1);
  });

  it('hälsodata skriver inte över befintliga värden med tomma', async () => {
    await applyImport(normalizePayload({ daily: [{ date: '2026-12-01', steps: 12000, resting_hr: 49 }] }), { hash: 'x', source: 'garmin', label: '' });
    await applyImport(normalizePayload({ daily: [{ date: '2026-12-01', sleep_h: 8 }] }), { hash: 'y', source: 'garmin', label: '' });
    const h = await db.health.get('2026-12-01');
    expect(h).toMatchObject({ steps: 12000, restingHr: 49, sleepH: 8 });
  });

  it('CSV-mallen och Garmin-nycklar känns igen, hip thrust importeras inte som övning i planen', async () => {
    const p = parseCsv('datum,övning,set,reps,vikt_kg,anteckning\n2026-11-10,Knäböj,1,10,40,\n2026-11-10,Latsdrag,1,8,35,bra');
    expect(p.workouts![0].sets).toHaveLength(2);
    expect(resolveExercise('BARBELL_BACK_SQUAT')).toBe('squat');
    expect(resolveExercise('SQUAT/BARBELL_BACK_SQUAT')).toBe('squat');
    expect(resolveExercise('Rumänsk marklyft')).toBe('rdl');
  });

  it('tom fil ger tydligt fel', () => {
    expect(() => normalizePayload({ format: 'x' })).toThrow(/inga pass/);
  });
});
