import { exercise } from './exercises';
import { dayName, pad2, prettyDate, weekDates } from './dates';
import type { PlannedSession, Settings, StrengthItem } from './types';

// Genererar en självförklarande Markdown-fil som Nellie lägger i sin Claude-app.
// Hennes Claude har Garmin-verktygen och skapar/schemalägger passen.

export interface GarminWorkoutSpec {
  name: string;
  date: string;
  type: 'running' | 'strength';
  tool: 'create_run_workout' | 'create_run_interval_workout' | 'create_strength_workout';
  args: Record<string, unknown>;
  beskrivning: string;
}

const TOOL_HINT = `Verktyg som troligen finns (namnen kan skilja sig lite – använd det som motsvarar):
- \`get_scheduled_workouts\` / \`get_workouts\` – kolla vad som redan finns
- \`create_run_workout\` – sammanhängande löppass med pulsintervall (hr_min/hr_max)
- \`create_run_interval_workout\` – intervaller med pulsintervall (hr_min/hr_max)
- \`create_strength_workout\` – styrkepass med övningar (name, category, sets, reps, rest_seconds)
- \`schedule_workout\` eller \`schedule_week\` – lägg passet på ett datum i kalendern
- \`unschedule_workout\`, \`delete_workout\`, \`reschedule_workout\` – flytta eller ta bort`;

export function workoutSpec(s: PlannedSession): GarminWorkoutSpec | undefined {
  if (!s.garminName || s.status === 'skipped') return undefined;
  const name = s.garminName;
  if (s.run) {
    const g = s.run.garmin;
    const [hrMin, hrMax] = g.hr;
    const desc = s.run.description;
    if (g.kind === 'interval') {
      return {
        name,
        date: s.date,
        type: 'running',
        tool: 'create_run_interval_workout',
        args: {
          name,
          repeats: g.repeats,
          rep_seconds: g.repSeconds,
          recovery_seconds: g.recoverySeconds,
          warmup_min: g.warmupMin,
          cooldown_min: g.cooldownMin,
          hr_min: hrMin,
          hr_max: hrMax,
        },
        beskrivning: desc,
      };
    }
    if (g.warmupMin > 0) {
      // Tempo: uppvärmning och nedjogg ska vara löpning, så det byggs som 1 intervall utan vila
      return {
        name,
        date: s.date,
        type: 'running',
        tool: 'create_run_interval_workout',
        args: { name, repeats: 1, rep_seconds: g.runSeconds, recovery_seconds: 0, warmup_min: g.warmupMin, cooldown_min: g.cooldownMin, hr_min: hrMin, hr_max: hrMax },
        beskrivning: desc,
      };
    }
    return {
      name,
      date: s.date,
      type: 'running',
      tool: 'create_run_workout',
      args: { name, run_seconds: g.runSeconds, warmup_min: 0, cooldown_min: 0, hr_min: hrMin, hr_max: hrMax },
      beskrivning: `${desc} Tiden är uppskattad från ${s.run.distanceText} – spring på pulsen, inte på klockan.`,
    };
  }
  if (s.strength) {
    return {
      name,
      date: s.date,
      type: 'strength',
      tool: 'create_strength_workout',
      args: { name, exercises: s.strength.items.filter((i) => i.role !== 'warmup').map(strengthExercise) },
      beskrivning: `${s.strength.intensityNote}. Börja med 5–8 min cykel/rodd + höftrörlighet.`,
    };
  }
  return undefined;
}

function strengthExercise(i: StrengthItem) {
  const ex = exercise(i.exerciseId);
  // Garmins styrkesteg är rep-baserade. Håll anges som sekunder i reps-fältet med förklaring.
  const reps = ex.id === 'negative-pullup' ? 3 : i.unit === 'seconds' ? i.repMax : i.repMax;
  return {
    name: ex.garmin.name ?? ex.name,
    category: ex.garmin.category,
    sets: i.sets,
    reps,
    rest_seconds: i.restSec ?? 90,
    svenska: `${ex.name}${i.unit === 'seconds' && ex.id !== 'negative-pullup' ? ` (håll ${i.repMin}–${i.repMax} s)` : ''}${i.perSide ? ' (per sida)' : ''}${i.note ? ` – ${i.note}` : ''}`,
  };
}

function fence(obj: unknown) {
  return '```json\n' + JSON.stringify(obj, null, 2) + '\n```';
}

export function weekFile(sessions: PlannedSession[], weeks: number[], s: Settings): { filename: string; text: string; count: number } {
  const ws = sessions
    .filter((x) => weeks.includes(x.week))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((x) => ({ x, spec: workoutSpec(x) }))
    .filter((y) => y.spec);
  const prefixes = weeks.map((w) => `RK V${pad2(w)}`);
  const first = weekDates(weeks[0], s.week1Start)[0];
  const last = weekDates(weeks[weeks.length - 1], s.week1Start)[6];
  const label = weeks.map((w) => pad2(w)).join('-');

  const lines: string[] = [];
  lines.push(`# Träningspass till Garmin – vecka ${weeks.join(' och ')} (${prettyDate(first)} – ${prettyDate(last)})`);
  lines.push('');
  lines.push('## Instruktion till Claude');
  lines.push('');
  lines.push(
    `Du har tillgång till Garmin-verktyg. Skapa följande ${ws.length} träningspass i min Garmin Connect och schemalägg dem på angivna datum så att de synkas till min klocka.`,
  );
  lines.push('');
  lines.push(`1. **Kontrollera först** mina schemalagda pass och mitt passbibliotek så att du inte skapar dubbletter. Alla pass har prefixet ${prefixes.map((p) => `\`${p}\``).join(' eller ')}. Om ett pass med exakt samma namn redan ligger på samma datum: hoppa över det.`);
  lines.push('2. Skapa varje pass med verktyget som anges i `tool` och argumenten i `args`. **Pulsmålen (hr_min/hr_max) är viktigast** – de gör att klockan larmar när jag springer för fort. Ta inte bort dem.');
  lines.push('3. Schemalägg varje pass på `date`.');
  lines.push('4. För styrkepass: `name` är Garmins övningsnyckel och `category` dess kategori. Om Garmin inte accepterar en nyckel, försök utan `name` (bara `category`), och skriv den svenska övningen i beskrivningen. Fältet `svenska` är bara för läsbarhet.');
  lines.push('5. Om `create_run_workout` inte accepterar `warmup_min`/`cooldown_min` = 0, använd 1.');
  lines.push('6. Simning skickas inte – den planerar jag själv.');
  lines.push('7. **Bekräfta med en lista** när du är klar: namn, datum och om passet skapades, redan fanns eller misslyckades (med orsak).');
  lines.push('');
  lines.push(TOOL_HINT);
  lines.push('');
  lines.push('## Passen');
  for (const { x, spec } of ws) {
    lines.push('');
    lines.push(`### ${spec!.name}`);
    lines.push(`${dayName(x.date)} ${prettyDate(x.date)} · ${x.title}`);
    lines.push('');
    lines.push(fence(spec));
  }
  lines.push('');
  lines.push(`_Skapad ${new Date().toLocaleString('sv-SE')} av Nellies träningsapp._`);
  return { filename: `garmin-vecka-${label}.md`, text: lines.join('\n'), count: ws.length };
}

/** Uppdateringsfil för pass som flyttats, hoppats över eller justerats efter senaste export. */
export function updateFile(changed: PlannedSession[], week: number): { filename: string; text: string; count: number } {
  const ops = changed
    .filter((x) => x.garminExported || x.garminName)
    .map((x) => {
      const old = x.garminExported;
      const spec = workoutSpec(x);
      if (!spec) {
        return { åtgärd: 'ta_bort', gammalt_namn: old?.name ?? x.garminName, gammalt_datum: old?.date ?? x.originalDate };
      }
      return {
        åtgärd: 'ersätt',
        gammalt_namn: old?.name ?? x.garminName,
        gammalt_datum: old?.date ?? x.originalDate,
        nytt_pass: spec,
        orsak: x.adjustment ? x.adjustment.reason : x.date !== (old?.date ?? x.originalDate) ? 'Flyttat till en annan dag' : 'Ändrat',
      };
    });
  const lines = [
    `# Uppdatering av Garmin-pass – vecka ${week}`,
    '',
    '## Instruktion till Claude',
    '',
    'Du har tillgång till Garmin-verktyg. Några pass i min Garmin-kalender har ändrats. För varje post nedan:',
    '',
    '- **ersätt**: leta upp passet med `gammalt_namn` på `gammalt_datum` (avschemalägg det och ta bort passet ur biblioteket), skapa sedan `nytt_pass` med angivet `tool` och `args` och schemalägg det på dess `date`. Om du hittar ett verktyg för att bara flytta (reschedule) och passet i övrigt är oförändrat går det också bra.',
    '- **ta_bort**: avschemalägg och ta bort passet med `gammalt_namn` på `gammalt_datum`.',
    '',
    'Behåll pulsmålen (hr_min/hr_max). Bekräfta med en lista över vad du gjorde.',
    '',
    TOOL_HINT,
    '',
    '## Ändringar',
    '',
    fence(ops),
  ];
  return { filename: `garmin-uppdatering-v${pad2(week)}-${Date.now().toString(36).slice(-4)}.md`, text: lines.join('\n'), count: ops.length };
}

/** Dela via Web Share (iOS) eller ladda ner. Returnerar hur det gick. */
export async function shareTextFile(filename: string, text: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([text], filename, { type: 'text/markdown' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelled';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
