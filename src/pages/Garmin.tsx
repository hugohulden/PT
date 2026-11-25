import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useSearchParams } from 'react-router-dom';
import { db } from '../db/db';
import { useSettings, useToday } from '../hooks';
import { prettyDate, weekDates, weekNumber } from '../lib/dates';
import { shareTextFile, updateFile, weekFile } from '../lib/garminExport';
import { Page, Section, Toast } from '../components/ui';

export default function Garmin() {
  const s = useSettings();
  const d = useToday();
  const [params] = useSearchParams();
  const current = Math.max(s.restartWeek, weekNumber(d, s.week1Start));
  const [week, setWeek] = useState(Number(params.get('vecka')) || current);
  const [two, setTwo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const weeks = two ? [week, week + 1].filter((w) => w <= s.raceWeek) : [week];
  const sessions = useLiveQuery(() => db.sessions.where('week').anyOf(weeks).toArray(), [weeks.join()]) ?? [];
  const dirty = useLiveQuery(() => db.sessions.filter((x) => !!x.garminDirty && !!x.garminExported).toArray(), []) ?? [];
  const file = weekFile(sessions, weeks, s);
  const dates = weekDates(week, s.week1Start);

  async function sendWeek() {
    const r = await shareTextFile(file.filename, file.text);
    if (r === 'cancelled') return;
    const now = Date.now();
    await db.transaction('rw', db.sessions, async () => {
      for (const x of sessions) if (x.garminName && x.status !== 'skipped') await db.sessions.update(x.id, { garminExported: { name: x.garminName, date: x.date, at: now }, garminDirty: false, updatedAt: now });
    });
    setToast(r === 'shared' ? 'Delad! Bifoga filen i din Claude-app 💖' : 'Filen är nedladdad – bifoga den i din Claude-app 💖');
  }

  async function sendUpdate() {
    const wk = Math.min(...dirty.map((x) => x.week));
    const f = updateFile(dirty, wk);
    const r = await shareTextFile(f.filename, f.text);
    if (r === 'cancelled') return;
    const now = Date.now();
    await db.transaction('rw', db.sessions, async () => {
      for (const x of dirty) await db.sessions.update(x.id, { garminExported: x.garminName ? { name: x.garminName, date: x.date, at: now } : undefined, garminDirty: false, updatedAt: now });
    });
    setToast('Uppdateringen är skickad ✨');
  }

  return (
    <Page title="Skicka till Garmin" back>
      <Toast msg={toast} onDone={() => setToast(null)} />

      {dirty.length > 0 && (
        <Section title="⚠️ Ändrade pass">
          <p className="mb-2 text-sm">
            {dirty.length} pass har flyttats eller ändrats efter att du skickade dem: {dirty.map((x) => x.title).join(', ')}.
          </p>
          <button className="btn btn-primary w-full" onClick={sendUpdate}>
            Skicka uppdateringsfil
          </button>
        </Section>
      )}

      <Section title="Välj vecka">
        <div className="flex items-center gap-2">
          <button className="btn btn-ghost px-4" onClick={() => setWeek((w) => Math.max(s.restartWeek, w - 1))} aria-label="Förra veckan">
            ‹
          </button>
          <div className="flex-1 text-center">
            <div className="font-display text-xl font-bold">Vecka {weeks.join(' + ')}</div>
            <div className="text-soft text-sm">
              {prettyDate(dates[0])} – {prettyDate(weekDates(weeks[weeks.length - 1], s.week1Start)[6])}
            </div>
          </div>
          <button className="btn btn-ghost px-4" onClick={() => setWeek((w) => Math.min(s.raceWeek, w + 1))} aria-label="Nästa vecka">
            ›
          </button>
        </div>
        <label className="mt-3 flex min-h-11 items-center gap-3">
          <input type="checkbox" className="h-6 w-6 accent-[#c2185b]" checked={two} onChange={(e) => setTwo(e.target.checked)} />
          <span className="font-semibold">Skicka två veckor på en gång</span>
        </label>
        <p className="text-soft mt-2 text-sm">
          {file.count} pass (löpning och gym) med pulsmål. Simning skickas inte.
        </p>
        <button className="btn btn-primary mt-3 w-full text-lg" onClick={sendWeek} disabled={!file.count}>
          ⌚ Skicka till Garmin
        </button>
        <button className="btn btn-ghost mt-2 w-full" onClick={() => setPreview(preview ? null : file.text)}>
          {preview ? 'Dölj filen' : 'Visa filen'}
        </button>
        {preview && <pre className="card-soft mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs">{file.text}</pre>}
      </Section>

      <Section title="Så gör du 💖">
        <ol className="space-y-2">
          <li className="card-soft">
            <b>1.</b> Tryck <b>Skicka till Garmin</b>. Välj <b>Claude</b> i delningsmenyn (eller <b>Spara i Filer</b>).
          </li>
          <li className="card-soft">
            <b>2.</b> Öppna <b>Claude</b>-appen och starta en ny chatt. Tryck på <b>+</b> och bifoga filen om den inte redan är med.
          </li>
          <li className="card-soft">
            <b>3.</b> Skriv <i>"Gör som filen säger"</i> och skicka. Claude lägger in passen i din Garmin-kalender och svarar med en lista.
          </li>
          <li className="card-soft">
            <b>4.</b> Öppna <b>Garmin Connect</b> och synka klockan. Passen ligger under <i>Träning → Kalender</i> på klockan.
          </li>
          <li className="card-soft">
            <b>5.</b> När du springer larmar klockan om pulsen går över taket. Lyssna på den! 💗
          </li>
        </ol>
        <p className="text-soft mt-2 text-sm">Flyttar du ett pass eller godkänner ett dagsformsförslag dyker en knapp upp här för att skicka en kort uppdatering.</p>
      </Section>
    </Page>
  );
}
