export default function StepRing({ steps, goal, bonus, size = 150 }: { steps: number; goal: number; bonus: number; size?: number }) {
  const r = size / 2 - 12;
  const c = 2 * Math.PI * r;
  const p = Math.min(1, steps / goal);
  const gold = steps >= bonus;
  const bonusP = steps > goal ? Math.min(1, (steps - goal) / (bonus - goal)) : 0;
  return (
    <div className="relative" style={{ width: size, height: size }} role="img" aria-label={`${steps.toLocaleString('sv-SE')} av ${goal.toLocaleString('sv-SE')} steg`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id="ring" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#FF3D8B" />
            <stop offset="100%" stopColor="#CDB4F5" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={14} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#ring)"
          strokeWidth={14}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
        {bonusP > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r - 13}
            fill="none"
            stroke="#F5C26B"
            strokeWidth={6}
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * (r - 13)}
            strokeDashoffset={2 * Math.PI * (r - 13) * (1 - bonusP)}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-xl" aria-hidden>
          {gold ? '🏅' : p >= 1 ? '💖' : '👟'}
        </span>
        <span className="font-display text-2xl font-bold leading-tight">{steps.toLocaleString('sv-SE')}</span>
        <span className="text-soft text-xs">av {goal.toLocaleString('sv-SE')}</span>
      </div>
    </div>
  );
}
