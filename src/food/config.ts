// Kaloriräknarens förval. Underhåll, underskott och makron går att ändra under
// Mer → Inställningar → Mat (och av Hugo via public/config.json).

export const FOOD = {
  /** Snitt total förbrukning senaste 28 dagarna enligt Garmin (25 nov 2026). */
  maintenanceKcal: 1995,
  /** Underskott per dag – målet blir förbrukning/underhåll minus detta. */
  deficitKcal: 400,
  /** Mer protein hjälper att behålla muskler vid underskott. */
  macroPct: { p: 30, c: 40, f: 30 },
  /**
   * Ungefärliga vikter för sådant man äter styckvis (ätbar del, gram) – används för
   * Livsmedelsverkets livsmedel så att du kan logga "2 st ägg" i stället för att väga.
   * Första ordet i namnet ska matcha; "has" kräver ett ord till; "not" utesluter.
   * Mer specifika regler först.
   */
  units: [
    { first: 'ägg', unit: 'st', g: 50 }, // medelstort ägg utan skal
    { first: 'banan', unit: 'st', g: 120, not: ['friterad', 'torkad', 'kokbanan'] }, // skalad
    { first: 'äpple', unit: 'st', g: 150, not: ['konserv', 'torkat', 'ugnsstekt'] },
    { first: 'päron', unit: 'st', g: 160, not: ['konserv', 'torkade'] },
    { first: 'apelsin', unit: 'st', g: 140 }, // skalad
    { first: 'kiwi', unit: 'st', g: 70 },
    { first: 'avokado', unit: 'st', g: 140, not: ['frysvara'] }, // utan skal och kärna
    { first: 'nektarin', unit: 'st', g: 130 },
    { first: 'persika', unit: 'st', g: 130, not: ['konserv', 'torkad'] },
    { first: 'plommon', unit: 'st', g: 50, not: ['konserv'] },
    { first: 'tomat', has: 'körsbärstomat', unit: 'st', g: 15 },
    { first: 'tomat', unit: 'st', g: 90, not: ['konserv', 'krossad', 'torkad'] },
    { first: 'potatis', unit: 'st', g: 90, not: ['mos', 'pommes', 'chips', 'gratäng', 'stuvad', 'råstuvad', 'råstekt', 'konserv', 'sallad', 'pulver', 'frysvara', 'klyftor', 'bullar', 'kroketter'] },
    { first: 'morot', unit: 'st', g: 70, not: ['konserv', 'stuvad'] },
    { first: 'lök', unit: 'st', g: 100, not: ['frysvara', 'rostad', 'stekt'] },
    { first: 'paprika', unit: 'st', g: 150, not: ['frysvara'] },
    { first: 'vitlök', unit: 'klyfta', g: 5 },
    { first: 'bröd', has: 'vetetortilla', unit: 'st', g: 40 },
    { first: 'bröd', has: 'tortilla', unit: 'st', g: 40 },
    { first: 'bröd', has: 'pitabröd', unit: 'st', g: 60 },
    { first: 'bröd', has: 'croissant', unit: 'st', g: 50 },
    { first: 'bröd', has: 'ostfralla', unit: 'st', g: 60 },
    { first: 'bröd', unit: 'skiva', g: 35, not: ['giffel', 'chapati', 'scones', 'tekaka', 'hönökaka', 'ciabatta', 'baguette', 'tunnbröd', 'rallarhalvor'] },
    { first: 'skorpor', unit: 'st', g: 11 },
    { first: 'ost', has: 'hårdost', unit: 'skiva', g: 10 },
    { first: 'smör', unit: 'klick', g: 5 },
    { first: 'köttbullar', unit: 'st', g: 15, not: ['sås'] },
    { first: 'kyckling', has: 'bröstfilé', unit: 'filé', g: 125, not: ['strimlad'] },
    { first: 'lax', unit: 'bit', g: 125, not: ['gravad', 'kallrökt'] },
    { first: 'pannkaka', unit: 'st', g: 45 },
    { first: 'mjölk', unit: 'glas', g: 200 }, // 2 dl
    { first: 'mellanmjölk', unit: 'glas', g: 200 },
    { first: 'lättmjölk', unit: 'glas', g: 200 },
    { first: 'yoghurt', unit: 'portion', g: 200 }, // 2 dl
    { first: 'filmjölk', unit: 'portion', g: 200 },
    { first: 'havregryn', unit: 'dl', g: 35 },
  ] as { first: string; has?: string; not?: string[]; unit: string; g: number }[],
};
