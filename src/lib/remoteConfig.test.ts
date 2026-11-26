import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../db/db';
import { ensureInitialized, getSettings, moveSession, saveSettings } from '../db/repo';
import { DEFAULT_SETTINGS } from './settings';
import { checkRemoteConfig, diffRemote, REMOTE_KEYS, type RemoteConfig } from './remoteConfig';

const file = JSON.parse(readFileSync('public/config.json', 'utf8')) as RemoteConfig;

describe('config.json', () => {
  it('stämmer med appens standardinställningar (så att första hämtningen inte ändrar något)', () => {
    for (const k of REMOTE_KEYS) expect(file.settings[k], k).toEqual(DEFAULT_SETTINGS[k]);
  });

  it('bara nycklar som ändrats mellan versionerna tas med', () => {
    const v2 = { ...file, version: file.version + 1, settings: { ...file.settings, hr: { ...DEFAULT_SETTINGS.hr, easy: [120, 148] as [number, number] } } };
    expect(Object.keys(diffRemote(file, v2))).toEqual(['hr']);
    expect(diffRemote(undefined, v2)).toEqual({});
    expect(diffRemote(v2, { ...v2 })).toEqual({});
  });
});

describe('hämta Hugos inställningar', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInitialized();
  });
  afterEach(() => vi.unstubAllGlobals());

  const serve = (cfg: RemoteConfig) => vi.stubGlobal('fetch', async () => new Response(JSON.stringify(cfg), { status: 200 }));

  it('första gången ändras inget, sedan kommer Hugos ändring in och hennes egna ligger kvar', async () => {
    serve(file);
    expect((await checkRemoteConfig()).changed).toEqual([]);

    // Hon ändrar själv namn och vilotid, och flyttar ett pass
    await saveSettings({ restSeconds: 120 });
    await moveSession('w09-easy', '2026-12-16');

    // Hugo sänker pulstaket för lugn löpning och skriver ett meddelande
    serve({ version: file.version + 1, message: 'Lite lägre pulstak nu 💖', settings: { ...file.settings, hr: { ...DEFAULT_SETTINGS.hr, easy: [120, 148] } } });
    const r = await checkRemoteConfig();
    expect(r.changed).toEqual(['pulstak']);
    expect(r.message).toBe('Lite lägre pulstak nu 💖');

    const s = await getSettings();
    expect(s.hr.easy).toEqual([120, 148]);
    expect(s.restSeconds).toBe(120); // hennes egen ändring ligger kvar
    expect((await db.sessions.get('w10-easy'))!.run!.hr).toEqual([120, 148]); // planen räknades om
    expect((await db.sessions.get('w09-easy'))!.date).toBe('2026-12-16'); // flyttat pass behålls

    // Samma version igen: inget nytt meddelande
    expect(await checkRemoteConfig()).toMatchObject({ changed: [], message: undefined });
  });

  it('offline gör ingenting', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    expect((await checkRemoteConfig()).changed).toEqual([]);
  });
});

describe('flytta långpasset via config', () => {
  beforeEach(async () => {
    await db.delete();
    await db.open();
    await ensureInitialized();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('hennes app med gamla veckodagar får långpass på söndag och pass som skickats till Garmin markeras för uppdatering', async () => {
    const old = { gymA: 1, easy: 2, gymB: 3, quality: 4, swim: 5, long: 6, rest: 7 };
    // Så som hennes app ser ut idag: lördag långpass, skickat till Garmin
    await saveSettings({ weekdays: old });
    const l = (await db.sessions.get('w07-long'))!;
    expect(l.date).toBe('2026-12-05');
    await db.sessions.update('w07-long', { garminExported: { name: l.garminName!, date: l.date, at: 1 } });
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ ...file, version: 1, settings: { ...file.settings, weekdays: old } }), { status: 200 }));
    await checkRemoteConfig();
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify(file), { status: 200 }));
    const r = await checkRemoteConfig();
    expect(r.changed).toEqual(['veckodagar för passen']);
    const n = (await db.sessions.get('w07-long'))!;
    expect(n.date).toBe('2026-12-06');
    expect(n.garminName).toMatch(/^RK V07 Sön/);
    expect(n.garminDirty).toBe(true);
    expect((await db.sessions.get('w07-rest'))!.date).toBe('2026-12-05');
  });
});
