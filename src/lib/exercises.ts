import type { Exercise } from './types';

// Garmin-nycklar verifierade mot Garmins FIT SDK (@garmin/fitsdk, Profile.types.*ExerciseName),
// omskrivna till Garmin Connects format (VERSALER_MED_UNDERSTRECK).
// Där ingen exakt nyckel finns anges bara närmaste kategori (name saknas).

export const EXERCISES: Exercise[] = [
  // --- Ben och rumpa ---
  { id: 'squat', name: 'Knäböj', category: 'ben', garmin: { category: 'SQUAT', name: 'BARBELL_BACK_SQUAT' }, alternatives: ['goblet-squat', 'hack-squat', 'leg-press'], big: true, increment: 2.5, unit: 'reps', cue: 'Bröstet upp, knäna ut över tårna' },
  { id: 'goblet-squat', name: 'Goblet squat', category: 'ben', garmin: { category: 'SQUAT', name: 'GOBLET_SQUAT' }, alternatives: ['squat', 'leg-press'], increment: 2, unit: 'reps' },
  { id: 'hack-squat', name: 'Hack squat (maskin)', category: 'ben', garmin: { category: 'SQUAT', name: 'BARBELL_HACK_SQUAT' }, alternatives: ['squat', 'leg-press'], big: true, increment: 5, unit: 'reps' },
  { id: 'leg-press', name: 'Benpress', category: 'ben', garmin: { category: 'SQUAT' }, alternatives: ['squat', 'hack-squat'], big: true, increment: 5, unit: 'reps' },
  { id: 'rdl', name: 'Rumänsk marklyft', category: 'rumpa', garmin: { category: 'DEADLIFT', name: 'ROMANIAN_DEADLIFT' }, alternatives: ['db-rdl', 'sl-rdl'], big: true, increment: 2.5, unit: 'reps', cue: 'Höften bakåt, rak rygg, känn baksida lår' },
  { id: 'db-rdl', name: 'Rumänsk marklyft med hantlar', category: 'rumpa', garmin: { category: 'DEADLIFT', name: 'ROMANIAN_DEADLIFT' }, alternatives: ['rdl', 'sl-rdl'], increment: 2, unit: 'reps' },
  { id: 'sl-rdl', name: 'Enbens rumänsk marklyft', category: 'rumpa', garmin: { category: 'DEADLIFT', name: 'SINGLE_LEG_ROMANIAN_DEADLIFT_WITH_DUMBBELL' }, alternatives: ['rdl', 'db-rdl'], increment: 2, unit: 'reps' },
  { id: 'bulgarian', name: 'Bulgarisk utfallsböj', category: 'rumpa', garmin: { category: 'LUNGE', name: 'DUMBBELL_BULGARIAN_SPLIT_SQUAT' }, alternatives: ['split-squat', 'step-up', 'reverse-lunge'], increment: 2, unit: 'reps', cue: 'Luta överkroppen lite framåt för mer rumpa' },
  { id: 'split-squat', name: 'Split squat med hantlar', category: 'rumpa', garmin: { category: 'SQUAT', name: 'DUMBBELL_SPLIT_SQUAT' }, alternatives: ['bulgarian', 'reverse-lunge'], increment: 2, unit: 'reps' },
  { id: 'reverse-lunge', name: 'Bakåtutfall', category: 'rumpa', garmin: { category: 'LUNGE' }, alternatives: ['bulgarian', 'split-squat'], increment: 2, unit: 'reps' },
  { id: 'pull-through', name: 'Pull-through i kabel', category: 'rumpa', garmin: { category: 'CHOP', name: 'CABLE_PULL_THROUGH' }, alternatives: ['back-ext-glute', 'kb-swing', 'cable-kickback'], increment: 2.5, unit: 'reps', cue: 'Gångjärn i höften, kläm rumpan i toppen' },
  { id: 'kb-swing', name: 'Kettlebell swing', category: 'rumpa', garmin: { category: 'HIP_SWING' }, alternatives: ['pull-through', 'back-ext-glute'], increment: 4, unit: 'reps' },
  { id: 'abduction', name: 'Abduktionsmaskin', category: 'rumpa', garmin: { category: 'HIP_STABILITY', name: 'STANDING_HIP_ABDUCTION' }, alternatives: ['cable-abduction', 'band-walk'], increment: 2.5, unit: 'reps' },
  { id: 'cable-abduction', name: 'Abduktion i kabel', category: 'rumpa', garmin: { category: 'HIP_STABILITY', name: 'STANDING_CABLE_HIP_ABDUCTION' }, alternatives: ['abduction', 'band-walk'], increment: 1.25, unit: 'reps' },
  { id: 'band-walk', name: 'Sidogång med gummiband', category: 'rumpa', garmin: { category: 'HIP_STABILITY', name: 'LATERAL_WALKS_WITH_BAND_AT_ANKLES' }, alternatives: ['abduction', 'cable-abduction'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'back-ext-glute', name: 'Ryggresningar med rumpfokus (45°)', category: 'rumpa', garmin: { category: 'HYPEREXTENSION', name: 'WEIGHTED_SINGLE_LEG_BACK_EXTENSION' }, alternatives: ['pull-through', 'reverse-hyper'], increment: 2.5, unit: 'reps', cue: 'Rund lätt i övre ryggen, driv med rumpan' },
  { id: 'reverse-hyper', name: 'Omvänd hyperextension', category: 'rumpa', garmin: { category: 'HYPEREXTENSION', name: 'BENT_KNEE_REVERSE_HYPEREXTENSION' }, alternatives: ['back-ext-glute'], increment: 2.5, unit: 'reps' },
  { id: 'cable-kickback', name: 'Kabel-kickbacks', category: 'rumpa', garmin: { category: 'HIP_STABILITY', name: 'STANDING_REAR_LEG_RAISE' }, alternatives: ['step-up', 'abduction'], increment: 1.25, unit: 'reps' },
  { id: 'step-up', name: 'Step-ups', category: 'rumpa', garmin: { category: 'SQUAT', name: 'DUMBBELL_STEP_UP' }, alternatives: ['cable-kickback', 'bulgarian'], increment: 2, unit: 'reps' },
  { id: 'leg-curl', name: 'Lårcurl', category: 'ben', garmin: { category: 'LEG_CURL' }, alternatives: ['rdl'], increment: 2.5, unit: 'reps' },

  // --- Rygg ---
  { id: 'lat-pulldown', name: 'Latsdrag', category: 'rygg', garmin: { category: 'PULL_UP', name: 'LAT_PULLDOWN' }, alternatives: ['wide-pulldown', 'close-pulldown'], increment: 2.5, unit: 'reps' },
  { id: 'wide-pulldown', name: 'Latsdrag brett grepp', category: 'rygg', garmin: { category: 'PULL_UP', name: 'WIDE_GRIP_LAT_PULLDOWN' }, alternatives: ['lat-pulldown', 'close-pulldown'], increment: 2.5, unit: 'reps' },
  { id: 'close-pulldown', name: 'Latsdrag smalt grepp', category: 'rygg', garmin: { category: 'PULL_UP', name: 'CLOSE_GRIP_LAT_PULLDOWN' }, alternatives: ['lat-pulldown', 'wide-pulldown'], increment: 2.5, unit: 'reps' },
  { id: 'seated-row', name: 'Sittande rodd', category: 'rygg', garmin: { category: 'ROW', name: 'SEATED_CABLE_ROW' }, alternatives: ['db-row', 'chest-row'], increment: 2.5, unit: 'reps' },
  { id: 'db-row', name: 'Enarmsrodd med hantel', category: 'rygg', garmin: { category: 'ROW', name: 'DUMBBELL_ROW' }, alternatives: ['seated-row', 'chest-row'], increment: 2, unit: 'reps' },
  { id: 'chest-row', name: 'Bröststödd rodd', category: 'rygg', garmin: { category: 'ROW', name: 'CHEST_SUPPORTED_DUMBBELL_ROW' }, alternatives: ['seated-row', 'db-row'], increment: 2, unit: 'reps' },
  { id: 'face-pull', name: 'Face pulls', category: 'axlar', garmin: { category: 'ROW', name: 'FACE_PULL' }, alternatives: ['rear-delt'], increment: 1.25, unit: 'reps' },
  { id: 'rear-delt', name: 'Omvända flyes', category: 'axlar', garmin: { category: 'LATERAL_RAISE', name: 'BENT_OVER_LATERAL_RAISE' }, alternatives: ['face-pull'], increment: 1, unit: 'reps' },

  // --- Pull-up-vägen ---
  { id: 'dead-hang', name: 'Dead hang', category: 'pullup', garmin: { category: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'seconds', bodyweight: true, cue: 'Aktiva axlar, andas lugnt' },
  { id: 'scap-pullup', name: 'Skapulära pull-ups', category: 'pullup', garmin: { category: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'reps', bodyweight: true, cue: 'Raka armar, dra ner skulderbladen' },
  { id: 'assisted-pullup', name: 'Assisterad pull-up i maskin', category: 'pullup', garmin: { category: 'PULL_UP', name: 'PULL_UP' }, alternatives: ['band-pullup'], increment: 2.5, unit: 'reps', assisted: true, cue: 'Logga motvikten – lägre är bättre!' },
  { id: 'band-pullup', name: 'Pull-up med gummiband', category: 'pullup', garmin: { category: 'PULL_UP', name: 'BAND_ASSISTED_PULL_UP' }, alternatives: ['assisted-pullup'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'inverted-row', name: 'Inverterad rodd', category: 'pullup', garmin: { category: 'ROW', name: 'INVERTED_ROW' }, alternatives: ['db-row'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'flexed-hang', name: 'Hängande med böjda armar', category: 'pullup', garmin: { category: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'seconds', bodyweight: true, cue: 'Hakan över stången, hoppa upp i läget' },
  { id: 'negative-pullup', name: 'Negativa pull-ups', category: 'pullup', garmin: { category: 'PULL_UP', name: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'seconds', bodyweight: true, cue: 'Hoppa upp, sänk dig så långsamt du kan. Logga sekunder ner per rep.' },
  { id: 'iso-holds', name: 'Isometriska håll (topp, 90°, 120°)', category: 'pullup', garmin: { category: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'seconds', bodyweight: true },
  { id: 'pullup', name: 'Pull-up', category: 'pullup', garmin: { category: 'PULL_UP', name: 'PULL_UP' }, alternatives: [], increment: 0, unit: 'reps', bodyweight: true },

  // --- Mage ---
  { id: 'hanging-knee-raise', name: 'Hängande knälyft', category: 'mage', garmin: { category: 'LEG_RAISE', name: 'HANGING_KNEE_RAISE' }, alternatives: ['reverse-crunch'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'reverse-crunch', name: 'Omvänd crunch', category: 'mage', garmin: { category: 'CRUNCH', name: 'REVERSE_CRUNCH' }, alternatives: ['hanging-knee-raise'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'plank', name: 'Plankan', category: 'mage', garmin: { category: 'PLANK', name: 'PLANK' }, alternatives: ['side-plank', 'dead-bug'], increment: 0, unit: 'seconds', bodyweight: true },
  { id: 'side-plank', name: 'Sidoplanka', category: 'mage', garmin: { category: 'PLANK', name: 'SIDE_PLANK' }, alternatives: ['plank'], increment: 0, unit: 'seconds', bodyweight: true },
  { id: 'dead-bug', name: 'Dead bug', category: 'mage', garmin: { category: 'HIP_STABILITY', name: 'DEAD_BUG' }, alternatives: ['plank'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'pallof', name: 'Pallof press', category: 'mage', garmin: { category: 'CHOP', name: 'HALF_KNEELING_STABILITY_CHOP' }, alternatives: ['side-plank'], increment: 1.25, unit: 'reps' },
  { id: 'cable-crunch', name: 'Kabelcrunch', category: 'mage', garmin: { category: 'CRUNCH', name: 'KNEELING_CABLE_CRUNCH' }, alternatives: ['reverse-crunch'], increment: 2.5, unit: 'reps' },

  // --- Bröst, axlar, armar (extrapass) ---
  { id: 'db-bench', name: 'Hantelpress på bänk', category: 'bröst', garmin: { category: 'BENCH_PRESS', name: 'DUMBBELL_BENCH_PRESS' }, alternatives: ['incline-db-bench', 'push-up'], increment: 2, unit: 'reps' },
  { id: 'incline-db-bench', name: 'Lutande hantelpress', category: 'bröst', garmin: { category: 'BENCH_PRESS', name: 'INCLINE_DUMBBELL_BENCH_PRESS' }, alternatives: ['db-bench'], increment: 2, unit: 'reps' },
  { id: 'push-up', name: 'Armhävningar', category: 'bröst', garmin: { category: 'PUSH_UP', name: 'PUSH_UP' }, alternatives: ['db-bench'], increment: 0, unit: 'reps', bodyweight: true },
  { id: 'shoulder-press', name: 'Axelpress med hantlar', category: 'axlar', garmin: { category: 'SHOULDER_PRESS', name: 'DUMBBELL_SHOULDER_PRESS' }, alternatives: [], increment: 1, unit: 'reps' },
  { id: 'lateral-raise', name: 'Sidolyft', category: 'axlar', garmin: { category: 'LATERAL_RAISE', name: 'DUMBBELL_LATERAL_RAISE' }, alternatives: ['rear-delt'], increment: 1, unit: 'reps' },
  { id: 'triceps-pushdown', name: 'Triceps-pushdown', category: 'armar', garmin: { category: 'TRICEPS_EXTENSION' }, alternatives: ['cable-kickback-tri'], increment: 1.25, unit: 'reps' },
  { id: 'cable-kickback-tri', name: 'Triceps-kickback i kabel', category: 'armar', garmin: { category: 'TRICEPS_EXTENSION', name: 'CABLE_KICKBACK' }, alternatives: ['triceps-pushdown'], increment: 1.25, unit: 'reps' },

  // --- Uppvärmning ---
  { id: 'warmup', name: 'Uppvärmning: cykel eller rodd + höftrörlighet', category: 'uppvärmning', garmin: { category: 'CARDIO' }, alternatives: [], increment: 0, unit: 'seconds', bodyweight: true },

  // --- Uteslutna (finns bara så att import kan känna igen dem) ---
  { id: 'hip-thrust', name: 'Hip thrust', category: 'rumpa', garmin: { category: 'HIP_RAISE' }, alternatives: [], increment: 2.5, unit: 'reps', excluded: true },
  { id: 'barbell-glute-bridge', name: 'Glute bridge med skivstång', category: 'rumpa', garmin: { category: 'HIP_RAISE' }, alternatives: [], increment: 2.5, unit: 'reps', excluded: true },
];

export const EXERCISE_MAP: Record<string, Exercise> = Object.fromEntries(EXERCISES.map((e) => [e.id, e]));

export function exercise(id: string): Exercise {
  const e = EXERCISE_MAP[id];
  if (!e) throw new Error(`Okänd övning: ${id}`);
  return e;
}

/** Alternativ som går att byta till – aldrig uteslutna övningar. */
export function alternativesFor(id: string): Exercise[] {
  const e = EXERCISE_MAP[id];
  if (!e) return [];
  const ids = new Set(e.alternatives);
  // Tillåt också att byta tillbaka från ett alternativ till övningar som listar detta
  for (const x of EXERCISES) if (x.alternatives.includes(id)) ids.add(x.id);
  ids.delete(id);
  return [...ids].map((i) => EXERCISE_MAP[i]).filter((x) => x && !x.excluded);
}

/** Försök känna igen en övning från fritext (import). */
export function matchExerciseName(raw: string): Exercise | undefined {
  const s = raw.trim().toLowerCase();
  const exact = EXERCISES.find((e) => e.name.toLowerCase() === s || e.id === s);
  if (exact) return exact;
  const aliases: [RegExp, string][] = [
    [/hip ?thrust/, 'hip-thrust'],
    [/glute ?bridge|höftlyft/, 'barbell-glute-bridge'],
    [/rumänsk|rdl|romanian/, 'rdl'],
    [/bulgar/, 'bulgarian'],
    [/goblet/, 'goblet-squat'],
    [/hack/, 'hack-squat'],
    [/benpress|leg ?press/, 'leg-press'],
    [/knäböj|squat/, 'squat'],
    [/pull.?through/, 'pull-through'],
    [/abdu/, 'abduction'],
    [/latsdrag|lat ?pull/, 'lat-pulldown'],
    [/sittande rodd|seated.*row|kabelrodd/, 'seated-row'],
    [/hantelrodd|db.?row|enarmsrodd/, 'db-row'],
    [/face ?pull/, 'face-pull'],
    [/ryggres|back ?ext|hyperext/, 'back-ext-glute'],
    [/kickback/, 'cable-kickback'],
    [/step.?up/, 'step-up'],
    [/assist.*pull|pull.*assist|assisterad/, 'assisted-pullup'],
    [/dead ?hang/, 'dead-hang'],
    [/negativ/, 'negative-pullup'],
    [/knälyft|knee raise/, 'hanging-knee-raise'],
    [/plank/, 'plank'],
    [/pallof/, 'pallof'],
    [/kabelcrunch|cable crunch/, 'cable-crunch'],
    [/lutande.*press|incline/, 'incline-db-bench'],
    [/bänkpress|hantelpress|bench/, 'db-bench'],
    [/axelpress|shoulder press/, 'shoulder-press'],
    [/sidolyft|lateral raise/, 'lateral-raise'],
    [/triceps|pushdown/, 'triceps-pushdown'],
    [/armhävning|push.?up/, 'push-up'],
    [/lårcurl|leg curl/, 'leg-curl'],
  ];
  for (const [re, id] of aliases) if (re.test(s)) return EXERCISE_MAP[id];
  return undefined;
}
