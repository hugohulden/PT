// Alla datum hanteras som 'YYYY-MM-DD'-strängar och räknas i UTC
// så att sommartid aldrig flyttar en dag.

export type ISODate = string;

const DAY = 86_400_000;

export function parse(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fmt(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return fmt(parse(d) + n * DAY);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parse(a) - parse(b)) / DAY);
}

/** ISO-veckodag: 1 = måndag … 7 = söndag */
export function isoWeekday(d: ISODate): number {
  const wd = new Date(parse(d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

export function mondayOf(d: ISODate): ISODate {
  return addDays(d, 1 - isoWeekday(d));
}

/** Dagens datum i telefonens lokala tidszon. */
export function today(): ISODate {
  const n = new Date();
  return fmt(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
}

/** Programmets veckonummer: V1 börjar på week1Start (en måndag). */
export function weekNumber(d: ISODate, week1Start: ISODate): number {
  return Math.floor(diffDays(d, week1Start) / 7) + 1;
}

export function weekStart(week: number, week1Start: ISODate): ISODate {
  return addDays(week1Start, (week - 1) * 7);
}

export function weekDates(week: number, week1Start: ISODate): ISODate[] {
  const s = weekStart(week, week1Start);
  return Array.from({ length: 7 }, (_, i) => addDays(s, i));
}

const DAYS_SV = ['', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag'];
const DAYS_SHORT = ['', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const MONTHS_SV = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const dayName = (d: ISODate) => DAYS_SV[isoWeekday(d)];
export const dayShort = (d: ISODate) => DAYS_SHORT[isoWeekday(d)];
export const dayShortByIndex = (i: number) => DAYS_SHORT[i];

export function prettyDate(d: ISODate): string {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS_SV[m - 1]}`;
}

export function pad2(n: number) {
  return String(n).padStart(2, '0');
}

export function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.round(sec % 60);
  return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

export function fmtPace(secPerKm: number): string {
  return `${Math.floor(secPerKm / 60)}:${pad2(Math.round(secPerKm % 60))}/km`;
}

// Hjälpfunktioner med samma namn som i hugohulden/traningsapp (används av kaloriräknaren)
export const DAY_SHORT = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
/** 0 = måndag … 6 = söndag */
export const weekday = (d: ISODate) => isoWeekday(d) - 1;
export const formatShort = (d: ISODate) => prettyDate(d);
export const formatLong = (d: ISODate) => `${dayName(d)} ${prettyDate(d)}`;
