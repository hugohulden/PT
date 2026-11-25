import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

// Gemensam grafstil. Färger från temat så att de fungerar i ljust och mörkt läge.

const axis = { stroke: 'var(--ink-soft)', fontSize: 12, tickLine: false, axisLine: false } as const;
const yTick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 100) / 10}k` : String(Math.round(v * 10) / 10)).replace('.', ',');
const tip = {
  contentStyle: { background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12, color: 'var(--ink)' },
  labelStyle: { color: 'var(--ink)', fontWeight: 600 },
  itemStyle: { color: 'var(--ink)' },
};

export function Empty({ text }: { text: string }) {
  return <p className="text-soft py-6 text-center text-sm">{text}</p>;
}

export function TrendChart<T extends object>({
  data,
  x,
  lines,
  unit,
  domain,
  refY,
  height = 200,
}: {
  data: T[];
  x: keyof T & string;
  lines: { key: keyof T & string; name: string; color: string; faded?: boolean; dot?: boolean }[];
  unit?: string;
  domain?: [number | 'auto' | 'dataMin' | 'dataMax', number | 'auto' | 'dataMin' | 'dataMax'];
  refY?: { y: number; label: string };
  height?: number;
}) {
  return (
    <div style={{ height }} className="-ml-3">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={24} />
          <YAxis {...axis} width={40} tickFormatter={yTick} domain={domain ?? ['auto', 'auto']} />
          <Tooltip {...tip} formatter={(v: number) => [`${Math.round(v * 10) / 10}${unit ?? ''}`]} />
          {refY && <ReferenceLine y={refY.y} stroke="var(--color-gold)" strokeDasharray="4 4" label={{ value: refY.label, fill: 'var(--ink-soft)', fontSize: 11, position: 'insideTopRight' }} />}
          {lines.map((l) => (
            <Line
              key={l.key}
              type="monotone"
              dataKey={l.key}
              name={l.name}
              stroke={l.color}
              strokeWidth={l.faded ? 1.5 : 3}
              strokeOpacity={l.faded ? 0.4 : 1}
              dot={l.dot ?? false}
              connectNulls
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Bars<T extends object>({
  data,
  x,
  bars,
  unit,
  refY,
  height = 200,
  stacked,
}: {
  data: T[];
  x: keyof T & string;
  bars: { key: keyof T & string; name: string; color: string }[];
  unit?: string;
  refY?: { y: number; label: string };
  height?: number;
  stacked?: boolean;
}) {
  return (
    <div style={{ height }} className="-ml-3">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={8} />
          <YAxis {...axis} width={40} tickFormatter={yTick} />
          <Tooltip {...tip} cursor={{ fill: 'var(--surface-2)' }} formatter={(v: number) => [`${Math.round(v * 10) / 10}${unit ?? ''}`]} />
          {refY && <ReferenceLine y={refY.y} stroke="var(--color-gold)" strokeDasharray="4 4" label={{ value: refY.label, fill: 'var(--ink-soft)', fontSize: 11, position: 'insideTopRight' }} />}
          {bars.map((b) => (
            <Bar key={b.key} dataKey={b.key} name={b.name} fill={b.color} radius={[6, 6, 0, 0]} stackId={stacked ? 'a' : undefined} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function AreaTrend<T extends object>({ data, x, y, unit, height = 160 }: { data: T[]; x: keyof T & string; y: keyof T & string; unit?: string; height?: number }) {
  return (
    <div style={{ height }} className="-ml-3">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="fillPink" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF3D8B" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#CDB4F5" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--line)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey={x} {...axis} minTickGap={24} />
          <YAxis {...axis} width={40} tickFormatter={yTick} domain={["auto", "auto"]} />
          <Tooltip {...tip} formatter={(v: number) => [`${Math.round(v * 10) / 10}${unit ?? ''}`]} />
          <Area type="monotone" dataKey={y} stroke="#FF3D8B" strokeWidth={2.5} fill="url(#fillPink)" connectNulls isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export const C = { pink: '#FF3D8B', pinkStrong: 'var(--accent)', lav: '#9B7BE0', rose: '#F7A8C4', gold: '#E0A43A', ok: '#2E9E68' };

/** 7-dagars glidande medel på kalenderdagar. */
export function movingAvg(points: { date: string; v: number }[], days = 7): { date: string; v: number; avg: number }[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((p) => {
    const from = new Date(p.date).getTime() - (days - 1) * 86_400_000;
    const win = sorted.filter((q) => new Date(q.date).getTime() >= from && q.date <= p.date);
    return { ...p, avg: win.reduce((s, q) => s + q.v, 0) / win.length };
  });
}
