import { addDays, diffDays, isoWeekday, type ISODate } from './dates';
import type { Activity, DailyHealth, PlannedSession, ReadinessRules, Settings, SetLog, StrengthItem } from './types';
import { exercise } from './exercises';
import { easyRun } from './plan/running';

// ---------------------------------------------------------------------------
// Regler när hon flyttar pass

const HEAVY_LEGS = new Set(['gymA', 'gymFull']);
const HARD_RUN = new Set(['quality', 'long', 'race']);

export function scheduleWarnings(week: PlannedSession[]): string[] {
  if (week.length === 0) return [];
  const warnings: string[] = [];
  const byDate = new Map<ISODate, PlannedSession[]>();
  for (const s of week) {
    if (s.status === 'skipped') continue;
    byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  }
  const on = (d: ISODate) => byDate.get(d) ?? [];
  for (const s of week) {
    if (s.status === 'skipped') continue;
    if (HEAVY_LEGS.has(s.kind)) {
      const next = on(addDays(s.date, 1));
      const hard = next.find((n) => n.kind === 'long' || n.kind === 'quality');
      if (hard) warnings.push(`Tungt benpass dagen före ${hard.kind === 'long' ? 'långpasset' : 'kvalitetspasset'} – benen behöver vila först.`);
    }
    if (HARD_RUN.has(s.kind)) {
      const next = on(addDays(s.date, 1)).find((n) => HARD_RUN.has(n.kind));
      if (next) warnings.push('Två hårda löppass i rad – lägg ett lugnt pass eller vila emellan.');
    }
  }
  const dates = new Set(week.map((s) => s.date));
  const weekDates = week.length ? weekDatesFrom(week) : [];
  const restDays = weekDates.filter((d) => !dates.has(d) || on(d).every((x) => x.kind === 'rest'));
  if (restDays.length === 0) warnings.push('Ingen vilodag den här veckan – minst en behövs, helst söndag.');
  else if (!restDays.some((d) => isoWeekday(d) === 7)) warnings.push('Söndagen är inte längre vilodag. Okej ibland, men försök hålla den fri 💖');
  return [...new Set(warnings)];
}

function weekDatesFrom(week: PlannedSession[]): ISODate[] {
  const first = week.reduce((m, s) => (s.originalDate < m ? s.originalDate : m), week[0].originalDate);
  const mon = addDays(first, 1 - isoWeekday(first));
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i));
}

// ---------------------------------------------------------------------------
// Pulstak-omdöme

export interface CapVerdict {
  ok: boolean;
  text: string;
  emoji: string;
}

export function capVerdict(kind: PlannedSession['kind'], avgHr: number | undefined, s: Settings): CapVerdict | undefined {
  if (!avgHr) return undefined;
  const cap = kind === 'long' ? s.hr.long : kind === 'quality' ? s.hr.quality : kind === 'easy' ? s.hr.easy : undefined;
  if (!cap) return undefined;
  const max = cap[1];
  if (kind === 'quality') {
    return avgHr <= max
      ? { ok: true, emoji: '✅', text: `Snyggt kontrollerat! Snittpuls ${avgHr}, under taket ${max}.` }
      : { ok: false, emoji: '⚠️', text: `Snittpuls ${avgHr}, taket var ${max}. Lugnare intervaller ger mer – du blir snabbare av kontroll 💖` };
  }
  if (avgHr <= max) return { ok: true, emoji: '✅', text: avgHr <= max - 5 ? 'Perfekt lugnt!' : `Perfekt lugnt! Snittpuls ${avgHr}.` };
  return { ok: false, emoji: '⚠️', text: `Snittpuls ${avgHr}, målet var max ${max}. Sakta ner nästa gång, det är så du blir snabbare 💖` };
}

/** Andel löptid inom tak (0–1). Använder tid inom tak om den finns, annars snittpuls som proxy. */
export function shareWithinCap(acts: Pick<Activity, 'durationSec' | 'secondsInCap' | 'withinCap'>[]): number | undefined {
  const total = acts.reduce((s, a) => s + (a.durationSec ?? 0), 0);
  if (!total) return undefined;
  const inCap = acts.reduce((s, a) => s + (a.secondsInCap ?? (a.withinCap ? (a.durationSec ?? 0) : 0)), 0);
  return inCap / total;
}

// ---------------------------------------------------------------------------
// Dagsform

export interface ReadinessSuggestion {
  rule: 'sleep' | 'rhr' | 'hrv';
  title: string;
  text: string;
  action: 'shorten' | 'rest' | 'easy';
}

export function readinessCheck(todayH: DailyHealth | undefined, history: DailyHealth[], r: ReadinessRules): ReadinessSuggestion[] {
  if (!todayH) return [];
  const out: ReadinessSuggestion[] = [];
  if (todayH.restingHr != null) {
    const prev = history.filter((h) => h.date < todayH.date && h.restingHr != null).slice(-7);
    const avg = prev.length >= 3 ? prev.reduce((s, h) => s + h.restingHr!, 0) / prev.length : undefined;
    const abs = todayH.restingHr >= r.rhrAbsolute;
    const rel = avg != null && todayH.restingHr >= avg + r.rhrAboveAvg;
    const hit = r.rhrMode === 'absolute' ? abs : r.rhrMode === 'relative' ? rel : abs || rel;
    if (hit)
      out.push({
        rule: 'rhr',
        action: 'rest',
        title: 'Förhöjd vilopuls',
        text: `Vilopulsen är ${todayH.restingHr}${avg ? ` (snitt ${Math.round(avg)})` : ''}. Kroppen ber om vila – ta en promenad i stället 🌿`,
      });
  }
  if (todayH.sleepH != null && todayH.sleepH < r.minSleepH) {
    out.push({
      rule: 'sleep',
      action: 'shorten',
      title: 'Kort natt',
      text: `Du sov ${todayH.sleepH.toFixed(1)} h. Förslag: korta dagens pass med ${r.shortenPct} % och hoppa över intervallerna.`,
    });
  }
  const lastDays = [...history.filter((h) => h.date < todayH.date), todayH].slice(-r.hrvUnbalancedDays);
  const consecutive =
    lastDays.length === r.hrvUnbalancedDays &&
    lastDays.every((h, i) => h.hrvStatus && h.hrvStatus !== 'BALANCED' && h.hrvStatus !== 'NONE' && (i === 0 || diffDays(h.date, lastDays[i - 1].date) === 1));
  if (consecutive) {
    out.push({
      rule: 'hrv',
      action: 'easy',
      title: 'HRV obalanserad',
      text: `HRV har varit obalanserad ${r.hrvUnbalancedDays} dagar i rad. Byt kvalitetspasset mot lugn löpning.`,
    });
  }
  return out;
}

/** Applicera ett dagsformsförslag på ett pass. Originalet sparas så att det kan ångras. */
export function applyReadiness(session: PlannedSession, sug: ReadinessSuggestion, s: Settings): PlannedSession | undefined {
  const original = { title: session.title, kind: session.kind, run: session.run, strength: session.strength };
  const adj = { reason: sug.text, rule: sug.rule, appliedAt: Date.now(), original };
  const k = 1 - s.readiness.shortenPct / 100;

  if (sug.action === 'rest') {
    if (session.kind === 'rest' || session.kind === 'race') return undefined;
    return { ...session, title: `Vila/promenad (istället för ${session.title.toLowerCase()})`, type: 'rest', run: undefined, strength: undefined, adjustment: adj, garminDirty: true };
  }
  if (sug.action === 'easy') {
    if (session.kind !== 'quality' || !session.run) return undefined;
    const km = Math.max(5, Math.round(session.run.estKm));
    return { ...session, title: `Lugn löpning ${km} km (istället för kvalitet)`, run: easyRun(s, km), adjustment: adj, garminDirty: true };
  }
  // shorten
  if (session.run) {
    const km = Math.max(3, Math.round((session.run.estKm * k) * 2) / 2);
    const cap = session.kind === 'long' ? s.hr.long : s.hr.easy;
    const run = easyRun(s, km);
    return {
      ...session,
      title: `${session.kind === 'long' ? 'Kortare långpass' : 'Kort lugnt pass'} ${km} km`,
      run: { ...run, hr: cap, garmin: { ...run.garmin, hr: cap } as typeof run.garmin },
      adjustment: adj,
      garminDirty: true,
    };
  }
  if (session.strength) {
    const items: StrengthItem[] = session.strength.items.map((i) =>
      i.role === 'main' || i.role === 'accessory' ? { ...i, sets: Math.max(1, Math.round(i.sets * k)) } : i,
    );
    return { ...session, title: `${session.title} (kortare)`, strength: { ...session.strength, items }, adjustment: adj, garminDirty: true };
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Dubbel progression

export interface WeightSuggestion {
  weightKg?: number;
  direction: 'up' | 'down' | 'same';
  reason?: string;
}

/**
 * history: setloggar per pass för en övning, äldst först.
 * Klarar hon översta reps i alla set → höj. Missar nedersta två pass i rad → sänk.
 */
export function suggestWeight(exerciseId: string, item: Pick<StrengthItem, 'repMin' | 'repMax' | 'sets'>, history: SetLog[][]): WeightSuggestion {
  const ex = exercise(exerciseId);
  const sessions = history.filter((h) => h.some((x) => x.done));
  const last = sessions.at(-1);
  if (!last) return { direction: 'same' };
  const done = last.filter((x) => x.done);
  const key = ex.assisted ? 'assistKg' : 'weightKg';
  const lastW = Math.max(...done.map((x) => x[key] ?? 0));
  if (ex.unit === 'seconds' || ex.bodyweight) return { direction: 'same', weightKg: lastW || undefined };

  const top = done.filter((x) => (x[key] ?? 0) === lastW);
  const hitTop = done.length >= item.sets && top.length >= item.sets && top.every((x) => (x.reps ?? 0) >= item.repMax);
  const missed = (h: SetLog[]) => h.filter((x) => x.done).some((x) => (x.reps ?? 0) < item.repMin);
  const twoMisses = sessions.length >= 2 && missed(sessions.at(-1)!) && missed(sessions.at(-2)!);

  const step = ex.big ? 2.5 : ex.increment || 2.5;
  if (hitTop) {
    if (ex.assisted) return { direction: 'up', weightKg: Math.max(0, lastW - step), reason: `Alla set på ${item.repMax} reps – prova ${step} kg mindre motvikt! 🎉` };
    return { direction: 'up', weightKg: lastW + step, reason: `Alla set på ${item.repMax} reps – dags för +${step} kg! 💪` };
  }
  if (twoMisses) {
    if (ex.assisted) return { direction: 'down', weightKg: lastW + step, reason: 'Lite mer hjälp två pass i rad – helt okej, vi bygger vidare.' };
    return { direction: 'down', weightKg: Math.max(0, lastW - step), reason: `Under ${item.repMin} reps två pass i rad – sänk lite och bygg upp igen.` };
  }
  return { direction: 'same', weightKg: lastW };
}

/** Epley-uppskattning av 1RM */
export const e1rm = (kg: number, reps: number) => (reps <= 1 ? kg : kg * (1 + reps / 30));
