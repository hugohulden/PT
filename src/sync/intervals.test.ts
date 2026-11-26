import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { ensureInitialized } from '../db/repo';
import { applyImport, normalizePayload } from '../lib/importer';
import { activitiesToPayload, hrvStatus, saveIntervalsConfig, syncIntervals, wellnessToPayload, type IcuActivity, type IcuWellness } from './intervals';

const ACTS: IcuActivity[] = [
  { id: 'i101', start_date_local: '2026-11-28T09:02:11', type: 'Run', name: 'Långpass', distance: 11230, moving_time: 5400, elapsed_time: 5600, average_heartrate: 147.6, max_heartrate: 162 },
  { id: 'i102', start_date_local: '2026-11-27T18:00:00', type: 'Swim', distance: 1300, moving_time: 2300 },
  { id: 'i103', start_date_local: '2026-11-26T17:30:00', type: 'WeightTraining', moving_time: 3500, average_heartrate: 110 },
];

const WELL: IcuWellness[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ id: `2026-11-${String(16 + i).padStart(2, '0')}`, hrv: 80 + (i % 3), restingHR: 49, sleepSecs: 28800, steps: 14000 })),
  { id: '2026-11-26', hrv: 60, restingHR: 53, sleepSecs: 19800, sleepScore: 55, steps: 9000, weight: 61.0 },
];

describe('Intervals.icu → appens format', () => {
  it('aktiviteter', () => {
    const a = activitiesToPayload(ACTS);
    expect(a[0]).toEqual({ source_id: 'icu-i101', type: 'Run', name: 'Långpass', start: '2026-11-28T09:02:11', distance_km: 11.23, duration_s: 5400, avg_hr: 148, max_hr: 162 });
    expect(a[2].type).toBe('WeightTraining');
  });

  it('wellness med beräknad HRV-status och vikt', () => {
    const w = wellnessToPayload(WELL);
    const last = w.daily!.at(-1)!;
    expect(last).toMatchObject({ date: '2026-11-26', sleep_h: 5.5, resting_hr: 53, hrv: 60, hrv_status: 'UNBALANCED', steps: 9000 });
    expect(w.daily![9].hrv_status).toBe('BALANCED');
    expect(w.weigh_ins).toEqual([{ date: '2026-11-26', kg: 61 }]);
  });

  it('HRV-status kräver minst 7 dagars baslinje', () => {
    expect(hrvStatus('2026-11-20', 60, [{ date: '2026-11-19', hrv: 80 }])).toBeUndefined();
  });
});

describe('synk mot Intervals.icu', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInitialized();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('synk utan nyckel blockerar inte senare synk (appen startar innan nyckeln är inlagd)', async () => {
    expect(await syncIntervals()).toEqual({});
    vi.stubGlobal('fetch', async () => new Response('[]', { status: 200 }));
    await saveIntervalsConfig({ apiKey: 'k', athleteId: '0' });
    expect((await syncIntervals()).ok).toBe(true);
  });

  it('hämtar, matchar mot planen och skickar nyckeln som Basic auth', async () => {
    const calls: { url: string; auth: string | null }[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push({ url, auth: new Headers(init.headers).get('Authorization') });
      return new Response(JSON.stringify(url.includes('/activities') ? ACTS : WELL), { status: 200 });
    });
    await saveIntervalsConfig({ apiKey: 'hemlig', athleteId: '0' });
    const st = await syncIntervals({ full: true });
    expect(st.ok).toBe(true);
    expect(calls[0].url).toBe('https://intervals.icu/api/v1/athlete/0/activities?oldest=2026-10-19&newest=' + calls[0].url.split('newest=')[1]);
    expect(calls[0].auth).toBe('Basic ' + btoa('API_KEY:hemlig'));
    expect((await db.sessions.get('w06-long'))!.status).toBe('done');
    expect((await db.sessions.get('w06-swim'))!.status).toBe('done');
    expect((await db.sessions.get('w06-gymA'))!.status).toBe('done');
    const act = await db.activities.get('icu-i101');
    expect(act!.withinCap).toBe(true); // snittpuls 148 under taket 150
    expect((await db.weighIns.toArray()).map((w) => w.kg)).toEqual([61]);
  });

  it('samma pass från Claude och Intervals.icu blir inte dubbletter', async () => {
    await applyImport(normalizePayload({ activities: [{ garmin_id: 555, type: 'running', start: '2026-11-28T09:01:30', distance_km: 11.2, avg_hr: 148 }] }), { hash: 'c', source: 'claude', label: '' });
    vi.stubGlobal('fetch', async (url: string) => new Response(JSON.stringify(url.includes('/activities') ? ACTS : []), { status: 200 }));
    await saveIntervalsConfig({ apiKey: 'k', athleteId: '0' });
    await syncIntervals({ full: true });
    expect(await db.activities.where('type').equals('running').count()).toBe(1);
  });

  it('fel nyckel och blockerat anrop ger begripliga meddelanden', async () => {
    await saveIntervalsConfig({ apiKey: 'fel', athleteId: '0' });
    vi.stubGlobal('fetch', async () => new Response('', { status: 401 }));
    await expect(syncIntervals()).rejects.toThrow(/godkände inte nyckeln/);
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('navigator', { onLine: true });
    await expect(syncIntervals()).rejects.toThrow(/mellanserver/);
  });
});
