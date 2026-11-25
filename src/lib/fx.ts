import confetti from 'canvas-confetti';

const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const COLORS = ['#FF3D8B', '#F7A8C4', '#CDB4F5', '#F5C26B', '#FFFFFF'];

export function celebrate(kind: 'pr' | 'milestone' | 'week' | 'hearts' = 'pr') {
  if (reduced()) return;
  if (kind === 'hearts') {
    const heart = confetti.shapeFromText({ text: '💖', scalar: 2 });
    confetti({ particleCount: 40, spread: 100, origin: { y: 0.3 }, shapes: [heart], scalar: 2, gravity: 0.6 });
    return;
  }
  const count = kind === 'milestone' ? 180 : kind === 'week' ? 140 : 90;
  confetti({ particleCount: count, spread: 80, origin: { y: 0.6 }, colors: COLORS, disableForReducedMotion: true });
  if (kind === 'milestone') {
    setTimeout(() => confetti({ particleCount: 80, angle: 60, spread: 60, origin: { x: 0 }, colors: COLORS }), 250);
    setTimeout(() => confetti({ particleCount: 80, angle: 120, spread: 60, origin: { x: 1 }, colors: COLORS }), 400);
  }
}

// ---------------------------------------------------------------------------
// Ljud: iOS kan inte vibrera från webben, så vilotimern piper.
// AudioContext måste låsas upp av ett tryck – det görs vid första ✓.

let ctx: AudioContext | undefined;

export function unlockAudio() {
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    // Spela en tyst ton för att låsa upp på iOS
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    g.gain.value = 0;
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.01);
  } catch {
    /* ljud är en bonus */
  }
}

export function chime() {
  if (!ctx) return;
  const notes = [880, 1175, 1568];
  notes.forEach((f, i) => {
    const o = ctx!.createOscillator();
    const g = ctx!.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = ctx!.currentTime + i * 0.16;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g).connect(ctx!.destination);
    o.start(t);
    o.stop(t + 0.4);
  });
}

// ---------------------------------------------------------------------------
// Wake Lock: håll skärmen tänd under passet

let lock: WakeLockSentinel | null = null;

export async function keepAwake(on: boolean) {
  try {
    if (on && 'wakeLock' in navigator) {
      lock = await navigator.wakeLock.request('screen');
    } else if (!on && lock) {
      await lock.release();
      lock = null;
    }
  } catch {
    /* t.ex. låg batterinivå */
  }
}

export function reacquireOnVisible(active: () => boolean) {
  const h = () => {
    if (document.visibilityState === 'visible' && active()) void keepAwake(true);
  };
  document.addEventListener('visibilitychange', h);
  return () => document.removeEventListener('visibilitychange', h);
}
