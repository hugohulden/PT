import type { Settings } from './types';

export const DEFAULT_SETTINGS: Settings = {
  id: 'main',
  name: 'Nellie',
  week1Start: '2026-10-19',
  restartWeek: 6,
  programStartWeek: 7,
  raceDate: '2027-05-22',
  raceName: 'Göteborgsvarvet',
  raceWeek: 31,
  weekdays: { gymA: 1, easy: 2, gymB: 3, quality: 4, swim: 5, long: 6, rest: 7 },
  hr: { easy: [120, 150], long: [125, 150], quality: [154, 170], maxHr: 193 },
  zones: { z2: 125, z3: 144, z4: 166, z5: 187 },
  easyPaceSec: 470, // 7:50/km – kalibreras mot hennes data
  racePaceSec: 365, // 6:05/km ≈ 2:08 på halvmaran
  deloadWeeks: [10, 14, 18, 22, 26],
  pullupTestWeeks: [10, 14, 18, 22, 26, 30],
  phases: [
    { key: 'restart', name: 'Omstart', fromWeek: 6, toWeek: 6, focus: 'Lätt, testa appen och synken' },
    { key: 'base', name: 'Bas', fromWeek: 7, toWeek: 14, focus: 'Lär dig springa lugnt inom pulstaket, grundstyrka' },
    { key: 'build', name: 'Uppbyggnad', fromWeek: 15, toWeek: 22, focus: 'Mer volym, intervaller, tyngre baslyft' },
    { key: 'specific', name: 'Loppspecifik', fromWeek: 23, toWeek: 28, focus: 'Långpass upp till 20 km, tempo i loppfart' },
    { key: 'taper', name: 'Nedtrappning', fromWeek: 29, toWeek: 31, focus: 'Mindre volym, behåll skärpan' },
  ],
  readiness: {
    minSleepH: 6,
    rhrAbsolute: 52,
    rhrAboveAvg: 4,
    rhrMode: 'absolute',
    hrvUnbalancedDays: 2,
    shortenPct: 30,
  },
  restSeconds: 90,
  steps: { goal: 10_000, bonus: 12_500 },
  theme: 'auto',
  customQuotes: [],
  soundOn: true,
  updatedAt: 0,
};
