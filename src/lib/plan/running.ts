import { fmtPace } from '../dates';
import type { HrRange, RunPlan, Settings } from '../types';
import { QUALITY, type QualitySpec } from './tables';

const WARM = 15;
const COOL = 10;

function hrText(hr: HrRange) {
  return `puls ${hr[0]}–${hr[1]}`;
}

export function easyRun(s: Settings, km: number, opts: { strides?: number; minutes?: number } = {}): RunPlan {
  const hr = s.hr.easy;
  const runSeconds = opts.minutes ? opts.minutes * 60 : Math.round(km * s.easyPaceSec);
  const estKm = opts.minutes ? +(runSeconds / s.easyPaceSec).toFixed(1) : km;
  const strides = opts.strides ? ` + ${opts.strides} stegringar på slutet` : '';
  return {
    hr,
    distanceKm: opts.minutes ? undefined : km,
    distanceText: opts.minutes ? `${opts.minutes} min` : `${km} km`,
    estKm,
    description: `Lugnt, ${hrText(hr)}. Styr på pulsen, inte farten – gå gärna i uppförsbackar.${strides}`,
    steps: [
      { kind: 'run', label: opts.minutes ? `${opts.minutes} min lugnt` : `${km} km lugnt`, distanceKm: opts.minutes ? undefined : km, durationSec: runSeconds, hr },
      ...(opts.strides ? [{ kind: 'strides' as const, label: `${opts.strides} × 20 s stegringar`, repeats: opts.strides, durationSec: 20 }] : []),
    ],
    garmin: { kind: 'continuous', runSeconds, warmupMin: 0, cooldownMin: 0, hr },
  };
}

export function longRun(s: Settings, km: number, text?: string): RunPlan {
  const hr = s.hr.long;
  const runSeconds = Math.round(km * s.easyPaceSec);
  return {
    hr,
    distanceKm: km,
    distanceText: text ?? `${km} km`,
    estKm: km,
    description: `Långpass ${text ?? km + ' km'}, ${hrText(hr)}. Pulsen bestämmer farten – det är okej att gå i backarna 💖`,
    steps: [{ kind: 'run', label: `${text ?? km + ' km'} långpass`, distanceKm: km, durationSec: runSeconds, hr }],
    garmin: { kind: 'continuous', runSeconds, warmupMin: 0, cooldownMin: 0, hr },
  };
}

function warmCoolKm(s: Settings) {
  return ((WARM + COOL) * 60) / s.easyPaceSec;
}

export function qualityTitle(q: QualitySpec): string {
  switch (q.type) {
    case 'fartlek':
      return `Fartlek ${q.reps} × 1 min`;
    case 'intervals':
      return q.hill ? `Backintervaller ${q.reps} × ${q.repSec / 60} min` : `Intervaller ${q.reps} × ${q.repSec / 60} min`;
    case 'tempo':
      return `Tempo ${q.minutes} min`;
    case 'racepace':
      return `${q.reps} × ${q.repKm} km i loppfart`;
  }
}

export function qualityRun(s: Settings, week: number): RunPlan | undefined {
  const q = QUALITY[week];
  if (!q) return undefined;
  return buildQuality(s, q);
}

export function buildQuality(s: Settings, q: QualitySpec): RunPlan {
  const hr = s.hr.quality;
  const base = warmCoolKm(s);
  const cap = `Puls ${hr[0]}–${hr[1]}, aldrig över ${hr[1]}.`;
  const warm = { kind: 'warmup' as const, label: `${WARM} min lugn uppvärmning`, durationSec: WARM * 60, hr: s.hr.easy };
  const cool = { kind: 'cooldown' as const, label: `${COOL} min nedjogg`, durationSec: COOL * 60, hr: s.hr.easy };

  switch (q.type) {
    case 'fartlek':
    case 'intervals': {
      const work = q.reps * q.repSec;
      const rec = (q.reps - 1) * q.recSec;
      const estKm = base + work / (s.racePaceSec - 20) + rec / (s.easyPaceSec + 60);
      const label = q.type === 'fartlek' ? '1 min pigg fart' : q.hill ? `${q.repSec / 60} min uppför` : `${q.repSec / 60} min`;
      const strides = q.type === 'fartlek' ? q.strides : 0;
      return {
        hr,
        estKm: +estKm.toFixed(1),
        distanceText: qualityTitle(q),
        description:
          `${qualityTitle(q)} med ${q.recSec >= 60 ? q.recSec / 60 + ' min' : q.recSec + ' s'} lugn joggvila. ${cap}` +
          (strides ? ` Avsluta med ${strides} stegringar.` : '') +
          (q.type === 'intervals' && q.hill ? ' Jogga lugnt ner som vila.' : ''),
        steps: [
          warm,
          { kind: 'interval', label, repeats: q.reps, durationSec: q.repSec, hr },
          { kind: 'recovery', label: 'joggvila', repeats: q.reps - 1, durationSec: q.recSec },
          ...(strides ? [{ kind: 'strides' as const, label: `${strides} × 20 s stegringar`, repeats: strides, durationSec: 20 }] : []),
          cool,
        ],
        garmin: { kind: 'interval', repeats: q.reps, repSeconds: q.repSec, recoverySeconds: q.recSec, warmupMin: WARM, cooldownMin: COOL, hr },
      };
    }
    case 'tempo': {
      const estKm = base + (q.minutes * 60) / s.racePaceSec;
      return {
        hr,
        estKm: +estKm.toFixed(1),
        distanceText: `Tempo ${q.minutes} min`,
        description: `${q.minutes} min i halvmarafart (ca ${fmtPace(s.racePaceSec)}). ${cap} Om pulsen går över ${hr[1]}: sakta ner, farten kommer.`,
        steps: [warm, { kind: 'interval', label: `${q.minutes} min tempo`, durationSec: q.minutes * 60, hr }, cool],
        garmin: { kind: 'continuous', runSeconds: q.minutes * 60, warmupMin: WARM, cooldownMin: COOL, hr },
      };
    }
    case 'racepace': {
      const repSec = Math.round(q.repKm * s.racePaceSec);
      const estKm = base + q.reps * q.repKm + ((q.reps - 1) * q.recSec) / (s.easyPaceSec + 60);
      return {
        hr,
        estKm: +estKm.toFixed(1),
        distanceText: qualityTitle(q),
        description: `${q.reps} × ${q.repKm} km i loppfart (ca ${fmtPace(s.racePaceSec)}) med ${q.recSec / 60} min joggvila. ${cap}`,
        steps: [
          warm,
          { kind: 'interval', label: `${q.repKm} km loppfart`, repeats: q.reps, distanceKm: q.repKm, durationSec: repSec, hr },
          { kind: 'recovery', label: 'joggvila', repeats: q.reps - 1, durationSec: q.recSec },
          cool,
        ],
        garmin: { kind: 'interval', repeats: q.reps, repSeconds: repSec, recoverySeconds: q.recSec, warmupMin: WARM, cooldownMin: COOL, hr },
      };
    }
  }
}
