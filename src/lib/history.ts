// Kända veckosummor före appen (V1–V5), från specen.
// Används som reserv och för att kontrollera Garmin-importen.
// Ersätts/kompletteras av riktiga pass när Garmin-historiken hämtas.

export interface HistoryRun {
  date?: string;
  label: string;
  km: number;
  avgHr?: number;
  pace?: string;
}

export interface HistoryWeek {
  week: number;
  from: string;
  to: string;
  runKm: number;
  approx?: boolean;
  comment: string;
  runs: HistoryRun[];
  other: string[];
}

export const HISTORY: HistoryWeek[] = [
  {
    week: 1,
    from: '2026-10-19',
    to: '2026-10-25',
    runKm: 15.2,
    comment: 'Alla löppass med snittpuls 163–170, långpasset uteblev.',
    runs: [],
    other: [],
  },
  {
    week: 2,
    from: '2026-10-26',
    to: '2026-11-01',
    runKm: 10.2,
    comment: 'Tempo på löpband, intervaller över taket.',
    runs: [{ date: '2026-11-01', label: 'Söndag', km: 5, avgHr: 140 }],
    other: [],
  },
  {
    week: 3,
    from: '2026-11-02',
    to: '2026-11-08',
    runKm: 18.9,
    comment: 'Alla pass inom pulstaket ✅',
    runs: [],
    other: [],
  },
  {
    week: 4,
    from: '2026-11-09',
    to: '2026-11-15',
    runKm: 24,
    approx: true,
    comment: 'Intervaller 5 × 4 min över taket. 12,3 km på söndagen (inte planerat).',
    runs: [{ date: '2026-11-15', label: 'Söndag (oplanerat)', km: 12.3, avgHr: 174 }],
    other: [],
  },
  {
    week: 5,
    from: '2026-11-16',
    to: '2026-11-22',
    runKm: 27.8,
    comment: 'Bästa veckan hittills i volym.',
    runs: [
      { label: 'Lugnt', km: 5.0, avgHr: 135 },
      { label: 'Löpband', km: 7.8, avgHr: 145 },
      { date: '2026-11-22', label: 'Långpass', km: 15.0, avgHr: 161, pace: '7:59/km' },
    ],
    other: ['Gym: ben', 'Gym: rygg', 'Simning 1 200 m'],
  },
];

export const historyWeek = (w: number) => HISTORY.find((h) => h.week === w);
