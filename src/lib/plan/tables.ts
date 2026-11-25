// Progressionstabeller för planen. Allt här är data – generatorn tolkar dem.

/** Långpass i km per vecka (puls enligt hr.long). */
export const LONG_KM: Record<number, number> = {
  6: 11, 7: 12, 8: 13, 9: 13, 10: 10, 11: 14, 12: 14, 13: 15, 14: 11,
  15: 15, 16: 16, 17: 16, 18: 12, 19: 17, 20: 17, 21: 18, 22: 13,
  23: 18, 24: 19, 25: 19, 26: 14, 27: 20, 28: 18, 29: 14, 30: 10,
};

export const LONG_TEXT: Record<number, string> = { 6: '10–12 km' };

/** Lugn löpning (tisdag) i km. */
export const EASY_KM: Record<number, number> = {
  7: 5, 8: 5, 9: 5, 10: 4, 11: 6, 12: 6, 13: 7, 14: 5,
  15: 7, 16: 8, 17: 8, 18: 6, 19: 8, 20: 9, 21: 9, 22: 7,
  23: 9, 24: 9, 25: 10, 26: 7, 27: 10, 28: 9, 29: 8, 30: 6,
};

export type QualitySpec =
  | { type: 'fartlek'; reps: number; repSec: number; recSec: number; strides: number }
  | { type: 'intervals'; reps: number; repSec: number; recSec: number; hill?: boolean }
  | { type: 'tempo'; minutes: number }
  | { type: 'racepace'; reps: number; repKm: number; recSec: number };

export const QUALITY: Record<number, QualitySpec> = {
  // Bas: fartlek 6–8 × 1 min + 4–6 stegringar
  7: { type: 'fartlek', reps: 6, repSec: 60, recSec: 90, strides: 4 },
  8: { type: 'fartlek', reps: 7, repSec: 60, recSec: 90, strides: 4 },
  9: { type: 'fartlek', reps: 8, repSec: 60, recSec: 90, strides: 5 },
  10: { type: 'fartlek', reps: 5, repSec: 60, recSec: 90, strides: 4 },
  11: { type: 'fartlek', reps: 8, repSec: 60, recSec: 90, strides: 6 },
  12: { type: 'fartlek', reps: 8, repSec: 60, recSec: 75, strides: 6 },
  13: { type: 'fartlek', reps: 8, repSec: 60, recSec: 60, strides: 6 },
  14: { type: 'fartlek', reps: 6, repSec: 60, recSec: 90, strides: 4 },
  // Uppbyggnad: 5 × 4 min, 6 × 3 min, backintervaller
  15: { type: 'intervals', reps: 5, repSec: 180, recSec: 120 },
  16: { type: 'intervals', reps: 5, repSec: 240, recSec: 120 },
  17: { type: 'intervals', reps: 8, repSec: 60, recSec: 120, hill: true },
  18: { type: 'intervals', reps: 4, repSec: 180, recSec: 120 },
  19: { type: 'intervals', reps: 6, repSec: 180, recSec: 120 },
  20: { type: 'intervals', reps: 5, repSec: 240, recSec: 120 },
  21: { type: 'intervals', reps: 10, repSec: 60, recSec: 120, hill: true },
  22: { type: 'intervals', reps: 4, repSec: 240, recSec: 120 },
  // Loppspecifik: tempo 20–40 min eller 2–3 × 3 km i loppfart
  23: { type: 'tempo', minutes: 25 },
  24: { type: 'racepace', reps: 2, repKm: 3, recSec: 180 },
  25: { type: 'tempo', minutes: 30 },
  26: { type: 'tempo', minutes: 20 },
  27: { type: 'tempo', minutes: 40 },
  28: { type: 'racepace', reps: 3, repKm: 3, recSec: 180 },
  // Nedtrappning: korta, skarpa påminnelser i loppfart
  29: { type: 'racepace', reps: 3, repKm: 2, recSec: 120 },
  30: { type: 'racepace', reps: 4, repKm: 1, recSec: 90 },
};

/** Simdistans-förslag per vecka (m). */
export function swimTarget(week: number, deload: boolean): number {
  const base = Math.min(2000, 1200 + Math.max(0, week - 6) * 50);
  return Math.round((deload ? base * 0.8 : base) / 100) * 100;
}

export const SWIM_IDEAS = [
  'Teknik: 4 × 50 m lugnt, 4 × 50 m med fokus på andning, sedan 4 × 100 m jämnt. Avsluta med 200 m valfritt.',
  'Uthållighet: 200 m uppsim, 3 × 300 m jämnt med 30 s vila, 200 m nedsim.',
  'Pyramid: 100–200–300–200–100 m med 20–30 s vila. Lugnt och avslappnat.',
  'Långt och lugnt: 400 m utan paus, 4 × 100 m, 400 m utan paus.',
  'Variation: 8 × 50 m (varannan lite snabbare), 2 × 400 m jämnt.',
];
