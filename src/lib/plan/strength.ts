import type { Phase, SessionKind, StrengthItem, StrengthPlan } from '../types';

type PhaseKey = Phase['key'];

const it = (
  exerciseId: string,
  sets: number,
  repMin: number,
  repMax: number,
  role: StrengthItem['role'],
  extra: Partial<StrengthItem> = {},
): StrengthItem => ({ exerciseId, sets, repMin, repMax, unit: 'reps', role, ...extra });

const sec = (exerciseId: string, sets: number, min: number, max: number, role: StrengthItem['role'], extra: Partial<StrengthItem> = {}) =>
  it(exerciseId, sets, min, max, role, { unit: 'seconds', ...extra });

const WARMUP = sec('warmup', 1, 300, 480, 'warmup', { note: '5–8 min cykel eller roddmaskin + höftrörlighet' });

/** Pull-up-steg utifrån vecka. */
export function pullupStep(week: number): 1 | 2 | 3 | 4 {
  if (week <= 10) return 1;
  if (week <= 18) return 2;
  if (week <= 26) return 3;
  return 4;
}

export const PULLUP_STEPS = [
  { step: 1, name: 'Grund', weeks: 'V6–10' },
  { step: 2, name: 'Styrka', weeks: 'V11–18' },
  { step: 3, name: 'Nära', weeks: 'V19–26' },
  { step: 4, name: 'Första', weeks: 'V27+' },
] as const;

export function pullupBlock(week: number, day: 'A' | 'B'): StrengthItem[] {
  const step = pullupStep(week);
  const r = { restSec: 90 };
  if (step === 1) {
    // Hon klarar 15 s dead hang idag – därför börjar vi kortare och bygger mot 30 s.
    const hang: [number, number] = week <= 8 ? [10, 20] : [15, 30];
    return day === 'A'
      ? [sec('dead-hang', 3, hang[0], hang[1], 'pullup', { ...r, note: 'Mål: 30 s i ett svep' }), it('scap-pullup', 3, 6, 8, 'pullup', r)]
      : [
          it('assisted-pullup', 3, 6, 8, 'pullup', { ...r, note: 'Logga motvikten i kg' }),
          it('inverted-row', 3, 8, 10, 'pullup', r),
        ];
  }
  if (step === 2) {
    return day === 'A'
      ? [sec('flexed-hang', 3, 10, 20, 'pullup', { ...r, note: 'Hakan över stången' }), sec('dead-hang', 2, 20, 40, 'pullup', r)]
      : [
          it('negative-pullup', 3, 3, 3, 'pullup', { ...r, note: '3–5 s ner' }),
          it('assisted-pullup', 3, 6, 8, 'pullup', { ...r, note: 'Försök sänka motvikten lite' }),
        ];
  }
  if (step === 3) {
    return day === 'A'
      ? [
          it('negative-pullup', 4, 3, 3, 'pullup', { ...r, note: '5–8 s ner' }),
          sec('iso-holds', 3, 5, 10, 'pullup', { ...r, note: 'Ett håll i varje läge: topp, 90°, 120°' }),
        ]
      : [it('assisted-pullup', 4, 4, 5, 'pullup', { ...r, note: 'Låg motvikt eller lätt gummiband' })];
  }
  return day === 'A'
    ? [it('pullup', 5, 1, 1, 'pullup', { restSec: 20, note: 'Kluster: 1 rep + 20 s vila × 5. Assistans eller negativ om det tar stopp.' })]
    : [
        it('negative-pullup', 3, 3, 3, 'pullup', { ...r, note: '5–8 s ner' }),
        it('pullup', 1, 1, 3, 'pullup', { note: 'Greasing the groove: 1 lätt försök flera gånger om dagen, aldrig till utmattning' }),
      ];
}

export function pullupTestItems(): StrengthItem[] {
  return [
    sec('dead-hang', 1, 1, 120, 'test', { note: 'TEST: max dead hang' }),
    sec('flexed-hang', 1, 1, 60, 'test', { note: 'TEST: max hängtid med böjda armar' }),
    sec('negative-pullup', 1, 1, 30, 'test', { note: 'TEST: längsta negativa (sekunder ner)' }),
    it('assisted-pullup', 1, 5, 5, 'test', { note: 'TEST: lägsta motvikt där du klarar 5 reps' }),
  ];
}

interface Scheme {
  main: [number, number, number]; // set, min, max
  acc: number; // set på assistansövningar
  accReps?: [number, number];
  note: string;
}

function scheme(phase: PhaseKey): Scheme {
  switch (phase) {
    case 'build':
      return { main: [4, 5, 8], acc: 3, accReps: [10, 12], note: 'Uppbyggnad: tyngre baslyft, assistans 3 × 10–12' };
    case 'specific':
      return { main: [3, 4, 6], acc: 2, accReps: [10, 12], note: 'Loppspecifik: tungt men låg volym' };
    case 'taper':
      return { main: [3, 4, 6], acc: 2, accReps: [10, 12], note: 'Nedtrappning: lättare, behåll skärpan' };
    default:
      return { main: [4, 8, 10], acc: 3, note: 'Bas: teknik först, RPE 7' };
  }
}

function acc(id: string, s: Scheme, sets: number, min: number, max: number, extra: Partial<StrengthItem> = {}) {
  const [mn, mx] = s.accReps ?? [min, max];
  return it(id, Math.min(sets, s.acc), mn, mx, 'accessory', extra);
}

export function gymA(phase: PhaseKey, week: number): StrengthItem[] {
  const s = scheme(phase);
  const [ms, mmin, mmax] = s.main;
  return [
    WARMUP,
    it('squat', ms, mmin, mmax, 'main', { restSec: 150 }),
    it('rdl', phase === 'base' || phase === 'restart' ? 3 : ms, mmin, mmax, 'main', { restSec: 120 }),
    acc('bulgarian', s, 3, 8, 10, { perSide: true }),
    acc('pull-through', s, 3, 12, 15),
    acc('abduction', s, 3, 15, 20),
    ...pullupBlock(week, 'A'),
    it('hanging-knee-raise', 3, 10, 12, 'core', { restSec: 60 }),
    sec('plank', 3, 40, 45, 'core', { restSec: 60 }),
  ];
}

export function gymB(phase: PhaseKey, week: number): StrengthItem[] {
  const s = scheme(phase);
  const latSets = phase === 'specific' || phase === 'taper' ? 3 : 4;
  return [
    WARMUP,
    it('lat-pulldown', latSets, 8, 10, 'main', { restSec: 120 }),
    ...pullupBlock(week, 'B'),
    acc('seated-row', s, 3, 10, 12),
    acc('back-ext-glute', s, 3, 12, 15),
    acc('cable-kickback', s, 3, 12, 12, { perSide: true, note: 'Lätt – dagen före kvalitetspasset. Alternativ: step-ups' }),
    acc('face-pull', s, 3, 15, 15),
    acc('db-bench', s, 3, 10, 10),
    it('pallof', 3, 10, 10, 'core', { perSide: true, restSec: 60 }),
    it('cable-crunch', 3, 15, 15, 'core', { restSec: 60 }),
  ];
}

/** Valfritt extrapass: bröst, axlar och triceps (tidigare fredagspasset). */
export function gymExtra(): StrengthItem[] {
  return [
    WARMUP,
    it('db-bench', 3, 8, 10, 'main', { restSec: 120 }),
    it('shoulder-press', 3, 8, 10, 'accessory'),
    it('incline-db-bench', 3, 10, 12, 'accessory'),
    it('lateral-raise', 3, 12, 15, 'accessory'),
    it('triceps-pushdown', 3, 12, 15, 'accessory'),
    it('push-up', 2, 6, 12, 'accessory'),
  ];
}

export function gymFullLight(week: number): StrengthItem[] {
  return [
    WARMUP,
    it('goblet-squat', 2, 8, 10, 'main'),
    it('rdl', 2, 6, 8, 'main'),
    it('lat-pulldown', 2, 8, 10, 'accessory'),
    it('seated-row', 2, 10, 10, 'accessory'),
    it('db-bench', 2, 10, 10, 'accessory'),
    ...pullupBlock(week, 'A').map((x) => ({ ...x, sets: Math.min(x.sets, 2) })),
    sec('plank', 2, 30, 40, 'core'),
  ];
}

export function activation(): StrengthItem[] {
  return [
    WARMUP,
    it('goblet-squat', 2, 8, 8, 'main', { note: 'Lätt! Bara väcka benen' }),
    it('band-walk', 2, 15, 15, 'accessory'),
    sec('dead-hang', 2, 20, 30, 'pullup'),
    sec('plank', 2, 30, 30, 'core'),
  ];
}

export function buildStrength(
  kind: SessionKind,
  phase: PhaseKey,
  week: number,
  opts: { deload: boolean; pullupTest: boolean; light?: boolean },
): StrengthPlan {
  let items: StrengthItem[];
  let note = scheme(phase).note;
  let loadFactor = 1;
  switch (kind) {
    case 'gymA':
      items = gymA(phase, week);
      break;
    case 'gymB':
      items = gymB(phase, week);
      break;
    case 'gymExtra':
      items = gymExtra();
      note = 'Valfritt extrapass – bara om du har energi ✨';
      break;
    case 'gymFull':
      items = gymFullLight(week);
      note = 'Lätt helkroppspass – nedtrappning';
      loadFactor = 0.85;
      break;
    case 'activation':
      items = activation();
      note = 'Loppvecka: endast aktivering, inget tungt';
      loadFactor = 0.7;
      break;
    default:
      throw new Error(`Inte ett styrkepass: ${kind}`);
  }

  if (opts.pullupTest) {
    items = [...items.filter((x) => x.role !== 'pullup'), ...pullupTestItems()];
  }

  if (opts.deload) {
    items = items.map((x) => (x.role === 'main' || x.role === 'accessory' ? { ...x, sets: Math.max(1, Math.ceil(x.sets / 2)) } : x));
    note = 'Avlastningsvecka: hälften av seten, ca 10 % lättare 💆‍♀️';
    loadFactor = 0.9;
  }
  if (opts.light) {
    items = items.map((x) => (x.role === 'main' || x.role === 'accessory' ? { ...x, sets: Math.max(2, x.sets - 1) } : x));
    loadFactor = Math.min(loadFactor, 0.9);
    note = 'Lätt omstartspass – känn efter och ha kul';
  }
  if (phase === 'taper' && kind === 'gymA') {
    loadFactor = 0.85;
  }

  return { template: kind, items, intensityNote: note, loadFactor, pullupTest: opts.pullupTest || undefined };
}
