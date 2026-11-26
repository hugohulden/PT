import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Badge,
  Exercise,
  Illness,
  DailyHealth,
  ImportRecord,
  Measurement,
  PhotoRecord,
  PlannedSession,
  PR,
  SetLog,
  Settings,
  WeighIn,
  WorkoutLog,
} from '../lib/types';

// ---------------------------------------------------------------------------
// Kaloriräknaren (från hugohulden/traningsapp)

export type Meal = 'frukost' | 'lunch' | 'middag' | 'mellanmal';

/** Näringsvärden. För livsmedel: per 100 g. För en loggrad: totalt. */
export interface Nutrients {
  kcal: number;
  p?: number;
  c?: number;
  f?: number;
}

/** Hur mycket som åts: gram, eller portioner (då med portionens vikt om den är känd). */
export interface Amount {
  unit: 'g' | 'portion';
  value: number;
}

/**
 * Ett livsmedel som använts eller sparats: egen produkt, cachad Open Food Facts-produkt
 * eller ett livsmedel från Livsmedelsverket som hon har ätit (för "Senast ätna" och favoriter).
 */
export interface FoodRec {
  id: string; // "lv:123", "off:<streckkod>", "egen:<uid>"
  source: 'lv' | 'off' | 'egen';
  name: string;
  brand?: string;
  barcode?: string;
  per100: Nutrients;
  /** Gram per portion, om känd. */
  servingG?: number;
  servingLabel?: string;
  /** Vad en portion heter: "st", "skiva", "glas" … (standard "portion"). */
  unitLabel?: string;
  favorite?: boolean;
  lastAmount?: Amount;
  lastUsedAt?: number;
  /** Sparad som egen produkt (inte bara cache). */
  saved?: boolean;
  updatedAt: number;
}

export interface RecipeIngredient {
  foodId?: string;
  name: string;
  grams: number;
  per100: Nutrients;
}

export interface RecipeRec {
  id: string;
  name: string;
  ingredients: RecipeIngredient[];
  /** Antal portioner rätten räcker till. */
  portions: number;
  /** Färdig vikt i gram (valfritt) – gör att hon kan logga i gram. */
  totalWeightG?: number;
  favorite?: boolean;
  lastAmount?: Amount;
  lastUsedAt?: number;
  updatedAt: number;
}

export interface FoodLogRec {
  id: string;
  date: string;
  meal: Meal;
  name: string;
  /** Totalt för det som loggades. */
  n: Nutrients;
  amount?: Amount;
  /** Gram per portion när amount är portioner. */
  servingG?: number;
  /** Vad en portion heter ("st", "skiva" …). */
  unitLabel?: string;
  ref: { kind: 'food' | 'recipe' | 'quick'; id?: string };
  createdAt: number;
}

/** Dagens förbrukning från Garmin (valfri). */
export interface FoodDayRec {
  date: string;
  burnedKcal: number;
}

export interface OutboxItem {
  id?: number;
  table: SyncedTable;
  key: string;
  at: number;
}

export interface Meta {
  key: string;
  value: unknown;
}

export const SYNCED_TABLES = [
  'settings',
  'sessions',
  'workoutLogs',
  'setLogs',
  'activities',
  'health',
  'weighIns',
  'measurements',
  'badges',
  'prs',
  'imports',
  'customExercises',
  'illness',
  'foodLog',
  'foods',
  'recipes',
  'foodDays',
] as const;
export type SyncedTable = (typeof SYNCED_TABLES)[number];

export class TrainingDB extends Dexie {
  settings!: Table<Settings, string>;
  sessions!: Table<PlannedSession, string>;
  workoutLogs!: Table<WorkoutLog, string>;
  setLogs!: Table<SetLog, string>;
  activities!: Table<Activity, string>;
  health!: Table<DailyHealth, string>;
  weighIns!: Table<WeighIn, string>;
  measurements!: Table<Measurement, string>;
  badges!: Table<Badge, string>;
  prs!: Table<PR, string>;
  imports!: Table<ImportRecord, string>;
  customExercises!: Table<Exercise, string>;
  illness!: Table<Illness, string>;
  foodLog!: Table<FoodLogRec, string>;
  foods!: Table<FoodRec, string>;
  recipes!: Table<RecipeRec, string>;
  foodDays!: Table<FoodDayRec, string>;
  /** Bilder sparas bara lokalt och synkas aldrig. */
  photos!: Table<PhotoRecord, string>;
  outbox!: Table<OutboxItem, number>;
  meta!: Table<Meta, string>;

  constructor(name = 'traningsapp') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      sessions: 'id, date, week, kind, status',
      workoutLogs: 'id, date, sessionId, status',
      setLogs: 'id, workoutLogId, exerciseId, date, [exerciseId+date]',
      activities: 'id, date, type, linkedSessionId',
      health: 'date',
      weighIns: 'id, date',
      measurements: 'id, date',
      badges: 'id, date',
      prs: 'id, exerciseId, date',
      imports: 'id',
      photos: 'id, date',
      outbox: '++id, [table+key]',
      meta: 'key',
    });
    this.version(2).stores({ customExercises: 'id' });
    this.version(3).stores({ illness: 'id, from' });
    this.version(4).stores({ foodLog: 'id, date, createdAt', foods: 'id, barcode, lastUsedAt', recipes: 'id, lastUsedAt', foodDays: 'date' });

    // Varje lokal ändring i en synkad tabell läggs i utkorgen.
    for (const t of SYNCED_TABLES) {
      const table = this.table(t);
      const pk = table.schema.primKey.keyPath as string;
      // Köas helt utanför den pågående transaktionen (Safari är strikt med det).
      // Ett fel här får aldrig stoppa själva ändringen.
      const enqueue = (key: string) => {
        if (!syncEnabled) return;
        setTimeout(() => {
          this.outbox.add({ table: t, key, at: Date.now() }).catch(() => undefined);
        }, 0);
      };
      table.hook('creating', function (primKey, obj) {
        enqueue(String(primKey ?? (obj as Record<string, unknown>)[pk]));
      });
      table.hook('updating', function (_mods, primKey) {
        enqueue(String(primKey));
      });
      table.hook('deleting', function (primKey) {
        enqueue(String(primKey));
      });
    }
  }
}

let syncEnabled = true;
/** Används när data kommer från servern så att den inte skickas tillbaka. */
export async function withoutOutbox<T>(fn: () => Promise<T>): Promise<T> {
  syncEnabled = false;
  try {
    return await fn();
  } finally {
    syncEnabled = true;
  }
}

export const db = new TrainingDB();

export function uid(): string {
  return crypto.randomUUID();
}
