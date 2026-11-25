import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  Badge,
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

    // Varje lokal ändring i en synkad tabell läggs i utkorgen.
    for (const t of SYNCED_TABLES) {
      const table = this.table(t);
      const pk = table.schema.primKey.keyPath as string;
      const enqueue = (key: string) => {
        if (!syncEnabled) return;
        void Dexie.ignoreTransaction(() => this.outbox.add({ table: t, key, at: Date.now() }));
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
