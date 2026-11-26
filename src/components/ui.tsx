import { useEffect, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { PlannedSession } from '../lib/types';

export function Page({ title, children, back, action }: { title?: ReactNode; children: ReactNode; back?: boolean; action?: ReactNode }) {
  const nav = useNavigate();
  return (
    <main className="mx-auto max-w-xl px-4 pb-28 safe-top">
      {(title || back) && (
        <header className="flex items-center gap-2 pb-3 pt-1">
          {back && (
            <button className="btn btn-ghost -ml-1 px-3" aria-label="Tillbaka" onClick={() => nav(-1)}>
              ‹
            </button>
          )}
          <h1 className="flex-1 text-2xl font-bold">{title}</h1>
          {action}
        </header>
      )}
      <div className="space-y-4">{children}</div>
    </main>
  );
}

export function Section({ title, children, right }: { title: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

export const KIND_EMOJI: Record<string, string> = {
  gymA: '🍑',
  gymB: '💪',
  gymExtra: '✨',
  gymFull: '💪',
  activation: '⚡',
  easy: '🏃‍♀️',
  quality: '🔥',
  long: '🏃‍♀️',
  swim: '🏊‍♀️',
  rest: '🚶‍♀️',
  race: '🏁',
};

export const STATUS_LABEL: Record<PlannedSession['status'], string> = {
  planned: 'Planerat',
  done: 'Klart ✓',
  missed: 'Missat',
  moved: 'Flyttat',
  skipped: 'Hoppat över',
};

export function StatusChip({ s, past }: { s: PlannedSession; past?: boolean }) {
  if (s.status === 'skipped' && s.adjustment?.rule === 'sick') return <span className="chip">Sjuk 🤒</span>;
  const status = s.status === 'planned' && past && s.kind !== 'rest' ? 'missed' : s.status;
  const cls =
    status === 'done'
      ? 'bg-[#d8f5e6] text-[#145c38] dark:bg-[#14432c] dark:text-[#bff0d6]'
      : status === 'missed'
        ? 'bg-[#ffe1cc] text-[#7a3500] dark:bg-[#4a2610] dark:text-[#ffd2b0]'
        : status === 'moved'
          ? 'bg-[#ece3fd] text-[#4a2a8a] dark:bg-[#352457] dark:text-[#ddd0ff]'
          : '';
  return <span className={`chip ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function HrBadge({ hr, big }: { hr: [number, number]; big?: boolean }) {
  return (
    <span className={`chip ${big ? 'px-3 py-1 text-base' : ''}`} style={{ background: 'var(--grad)', color: 'var(--on-grad)' }}>
      💗 {hr[0]}–{hr[1]}
    </span>
  );
}

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40" onClick={onClose} role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-surface pop max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-t-[28px] p-5 safe-bottom" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xl font-bold">{title}</h2>
          <button className="btn btn-ghost px-3" onClick={onClose} aria-label="Stäng">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function MenuLink({ to, icon, label, hint }: { to: string; icon: string; label: string; hint?: string }) {
  return (
    <Link to={to} className="card flex min-h-[56px] items-center gap-3 py-3">
      <span className="text-2xl" aria-hidden>
        {icon}
      </span>
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        {hint && <span className="text-soft block text-sm">{hint}</span>}
      </span>
      <span className="text-soft" aria-hidden>
        ›
      </span>
    </Link>
  );
}

export function Toast({ msg, onDone }: { msg: string | null; onDone: () => void }) {
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(onDone, 3500);
    return () => clearTimeout(t);
  }, [msg, onDone]);
  if (!msg) return null;
  return (
    <div role="status" className="pop fixed inset-x-4 top-[max(env(safe-area-inset-top),12px)] z-[60] mx-auto max-w-md rounded-2xl bg-[#5A1F4B] px-4 py-3 text-center font-semibold text-white shadow-lg">
      {msg}
    </div>
  );
}
