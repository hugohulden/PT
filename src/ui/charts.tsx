import type { ReactNode } from 'react';
import { ResponsiveContainer } from 'recharts';

/** Diagramfärger i Nellies palett. CSS-variablerna följer ljust/mörkt läge automatiskt. */
const NELLIE = { run: '#9B7BE0', gym: '#FF3D8B', swim: '#9B7BE0', ref: 'var(--ink-soft)', grid: 'var(--line)', axis: 'var(--ink-soft)', panel: 'var(--surface)', panel2: 'var(--surface)', ink: 'var(--ink)' };
const PALETTES = { dark: NELLIE, light: NELLIE };

/** Aktuella färger (uppdateras av setChartTheme; diagrammen ritas om när temat byts). */
export const C = { ...PALETTES.dark };
export const axisProps = { stroke: C.grid, tick: { fill: C.axis, fontSize: 11 }, tickLine: false, axisLine: false };
export const tooltipProps = {
  contentStyle: { background: C.panel2, border: `1px solid ${C.grid}`, borderRadius: 12, color: C.ink, fontSize: 13 },
  labelStyle: { color: C.axis },
  itemStyle: { color: C.ink },
  cursor: { stroke: C.ref, strokeWidth: 1, fill: 'rgba(255,61,139,0.08)' },
};

export function setChartTheme(t: 'dark' | 'light') {
  Object.assign(C, PALETTES[t]);
  axisProps.stroke = C.grid;
  axisProps.tick.fill = C.axis;
  Object.assign(tooltipProps.contentStyle, { background: C.panel2, border: `1px solid ${C.grid}`, color: C.ink });
  tooltipProps.labelStyle.color = C.axis;
  tooltipProps.itemStyle.color = C.ink;
  tooltipProps.cursor.stroke = C.ref;
}

export function ChartBox({ title, children, legend, empty }: { title: string; children: ReactNode; legend?: ReactNode; empty?: boolean }) {
  return (
    <div className="rounded-2xl bg-panel border border-line p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="font-semibold">{title}</div>
        {legend}
      </div>
      {empty ? (
        <div className="h-40 flex items-center justify-center text-sm text-mute">Ingen data än</div>
      ) : (
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

export function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-1 text-xs text-mute">
      <span className="inline-block w-4" style={{ borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}` }} />
      {label}
    </span>
  );
}
