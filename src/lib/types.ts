import type { ISODate } from './dates';

export type HrRange = [number, number];

export type SessionKind =
  | 'gymA'
  | 'gymB'
  | 'gymExtra'
  | 'gymFull'
  | 'activation'
  | 'easy'
  | 'quality'
  | 'long'
  | 'swim'
  | 'rest'
  | 'race';

export type SessionType = 'strength' | 'running' | 'swimming' | 'rest';

/** Var i veckan ett pass ligger som standard (ISO-veckodag 1–7). */
export type WeekdayMap = Record<'gymA' | 'easy' | 'gymB' | 'quality' | 'swim' | 'long' | 'rest', number>;

export interface Phase {
  key: 'restart' | 'base' | 'build' | 'specific' | 'taper';
  name: string;
  fromWeek: number;
  toWeek: number;
  focus: string;
}

export interface ReadinessRules {
  minSleepH: number;
  /** Fast gräns för vilopuls. */
  rhrAbsolute: number;
  /** Slår till om vilopulsen ligger så här många slag över 7-dagarssnittet. */
  rhrAboveAvg: number;
  rhrMode: 'absolute' | 'relative' | 'either';
  hrvUnbalancedDays: number;
  shortenPct: number;
}

export interface Settings {
  id: 'main';
  name: string;
  week1Start: ISODate; // måndag i V1
  restartWeek: number; // V6
  programStartWeek: number; // V7
  raceDate: ISODate;
  raceName: string;
  raceWeek: number;
  weekdays: WeekdayMap;
  hr: { easy: HrRange; long: HrRange; quality: HrRange; maxHr: number };
  zones: { z2: number; z3: number; z4: number; z5: number };
  /** Ungefärlig lugn fart (s/km) för att räkna om km till tid för Garmin. */
  easyPaceSec: number;
  racePaceSec: number;
  deloadWeeks: number[];
  pullupTestWeeks: number[];
  phases: Phase[];
  readiness: ReadinessRules;
  restSeconds: number;
  steps: { goal: number; bonus: number };
  theme: 'auto' | 'light' | 'dark';
  customQuotes: string[];
  soundOn: boolean;
  updatedAt: number;
}

export interface RunStep {
  kind: 'warmup' | 'run' | 'interval' | 'recovery' | 'cooldown' | 'strides';
  label: string;
  durationSec?: number;
  distanceKm?: number;
  repeats?: number;
  hr?: HrRange;
}

export interface RunPlan {
  /** Styrande pulsintervall för passet. */
  hr: HrRange;
  distanceKm?: number;
  distanceText?: string;
  /** Uppskattad total distans för veckovolym. */
  estKm: number;
  description: string;
  steps: RunStep[];
  /** För Garmin: kontinuerligt pass eller intervaller */
  garmin:
    | { kind: 'continuous'; runSeconds: number; warmupMin: number; cooldownMin: number; hr: HrRange }
    | {
        kind: 'interval';
        repeats: number;
        repSeconds: number;
        recoverySeconds: number;
        warmupMin: number;
        cooldownMin: number;
        hr: HrRange;
      };
}

export interface StrengthItem {
  exerciseId: string;
  sets: number;
  repMin: number;
  repMax: number;
  /** 'reps' eller 'seconds' för håll */
  unit: 'reps' | 'seconds';
  perSide?: boolean;
  role: 'main' | 'accessory' | 'core' | 'pullup' | 'warmup' | 'test';
  note?: string;
  restSec?: number;
}

export interface StrengthPlan {
  template: SessionKind;
  items: StrengthItem[];
  intensityNote: string;
  /** Faktor för föreslagen vikt (0.9 = 10 % lättare) */
  loadFactor: number;
  pullupTest?: boolean;
}

export type SessionStatus = 'planned' | 'done' | 'missed' | 'moved' | 'skipped';

export interface Adjustment {
  reason: string;
  rule: 'sleep' | 'rhr' | 'hrv' | 'manual';
  appliedAt: number;
  original: Pick<PlannedSession, 'title' | 'kind' | 'run' | 'strength'>;
}

export interface PlannedSession {
  id: string; // deterministiskt, t.ex. "w07-quality"
  week: number;
  date: ISODate;
  originalDate: ISODate;
  type: SessionType;
  kind: SessionKind;
  title: string;
  subtitle?: string;
  run?: RunPlan;
  strength?: StrengthPlan;
  swim?: { suggestion: string; targetM: number };
  status: SessionStatus;
  adjustment?: Adjustment;
  garminName?: string;
  /** Kopplad Garmin-aktivitet eller gymlogg */
  activityId?: string;
  workoutLogId?: string;
  /** Ändrad av användaren – skrivs inte över vid omgenerering */
  userModified?: boolean;
  /** Ändrad efter senaste Garmin-export, behöver uppdateringsfil */
  garminDirty?: boolean;
  updatedAt: number;
}

export interface Exercise {
  id: string;
  name: string;
  category: 'ben' | 'rumpa' | 'rygg' | 'mage' | 'bröst' | 'axlar' | 'armar' | 'pullup' | 'uppvärmning';
  /** Garmin Connect-nyckel: kategori + namn enligt FIT SDK */
  garmin: { category: string; name?: string };
  alternatives: string[];
  /** Stort lyft → +2,5 kg, annars mindre steg */
  big?: boolean;
  increment: number;
  unit: 'reps' | 'seconds';
  /** Loggar motvikt (assistans) i stället för vikt */
  assisted?: boolean;
  bodyweight?: boolean;
  excluded?: boolean;
  cue?: string;
}

export interface SetLog {
  id: string;
  workoutLogId: string;
  exerciseId: string;
  /** Övningen i mallen som byttes ut, för historik */
  slotExerciseId?: string;
  setIndex: number;
  weightKg?: number;
  reps?: number;
  seconds?: number;
  assistKg?: number;
  rpe?: number;
  done: boolean;
  doneAt?: number;
  isPr?: boolean;
  date: ISODate;
  source: 'app' | 'garmin' | 'import';
  updatedAt: number;
  deleted?: boolean;
}

export interface WorkoutLog {
  id: string;
  date: ISODate;
  sessionId?: string;
  kind: SessionKind;
  title: string;
  startedAt: number;
  finishedAt?: number;
  /** Övningsbyten: mall-övning → vald övning */
  swaps: Record<string, string>;
  notes: Record<string, string>;
  exerciseRpe: Record<string, number>;
  status: 'active' | 'done';
  source: 'app' | 'garmin' | 'import';
  beforeApp?: boolean;
  importHash?: string;
  updatedAt: number;
  deleted?: boolean;
}

export interface Activity {
  id: string; // garmin-<activityId> eller import-<hash>
  garminId?: number;
  type: 'running' | 'swimming' | 'strength' | 'walking' | 'other';
  name?: string;
  start: string; // ISO-tidsstämpel
  date: ISODate;
  distanceKm?: number;
  durationSec?: number;
  avgHr?: number;
  maxHr?: number;
  paceSecPerKm?: number;
  /** Sekunder per pulszon [z1..z5] eller tid inom tak */
  secondsInCap?: number;
  linkedSessionId?: string;
  withinCap?: boolean;
  capVerdict?: string;
  source: 'garmin' | 'import' | 'claude';
  beforeApp?: boolean;
  sets?: { exercise: string; reps?: number; weightKg?: number }[];
  updatedAt: number;
}

export interface DailyHealth {
  date: ISODate;
  steps?: number;
  sleepH?: number;
  sleepScore?: number;
  restingHr?: number;
  hrv?: number;
  hrvStatus?: 'BALANCED' | 'UNBALANCED' | 'LOW' | 'POOR' | 'NONE';
  intensityMin?: number;
  raceTimes?: { k5?: number; k10?: number; half?: number };
  updatedAt: number;
}

export interface WeighIn {
  id: string;
  date: ISODate;
  kg: number;
  source: 'app' | 'garmin' | 'import';
  updatedAt: number;
  deleted?: boolean;
}

export interface Measurement {
  id: string;
  date: ISODate;
  waistCm?: number;
  hipCm?: number;
  thighCm?: number;
  updatedAt: number;
  deleted?: boolean;
}

export interface Badge {
  id: string;
  earnedAt: number;
  date: ISODate;
  detail?: string;
}

export interface PR {
  id: string; // exerciseId + typ + vikt
  exerciseId: string;
  kind: 'heaviest' | 'mostReps' | 'longestHold' | 'lowestAssist';
  value: number;
  weightKg?: number;
  date: ISODate;
  setLogId: string;
  updatedAt: number;
}

export interface ImportRecord {
  id: string; // hash
  source: 'csv' | 'json' | 'claude' | 'garmin' | 'backup';
  at: number;
  count: number;
  label: string;
}

export interface PhotoRecord {
  id: string;
  date: ISODate;
  blob: Blob;
}
