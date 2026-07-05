import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Legend, Pie, PieChart, Tooltip, XAxis, YAxis } from 'recharts';
import { AXIS_TICK, colorFor, GRID_STROKE } from '../theme';

/**
 * Factory functions that return actual recharts chart *elements* (not wrapper
 * components). This matters: `ResponsiveContainer` clones its child to inject
 * width/height, so the child must be a real chart element (PieChart/BarChart),
 * never a custom component that would swallow those props.
 */

export interface NamedValue {
  name: string;
  value: number;
}

/** Human-friendly slice/label name: `in_progress` → `In progress`. */
export function prettify(name: string): string {
  const s = name.replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Donut pie with colored slices, a custom tooltip, and a legend. */
export function donut({
  data,
  tooltip,
  isMobile,
  colorLookup,
}: {
  data: NamedValue[];
  tooltip: ReactElement;
  isMobile: boolean;
  colorLookup?: Record<string, string>;
}): ReactElement {
  return (
    <PieChart>
      <Pie
        data={data}
        dataKey="value"
        nameKey="name"
        cx="50%"
        cy="50%"
        innerRadius={isMobile ? 42 : 58}
        outerRadius={isMobile ? 72 : 92}
        paddingAngle={data.length > 1 ? 2 : 0}
        label={
          isMobile
            ? false
            : (e: { name?: string; percent?: number }) =>
                `${Math.round((e.percent ?? 0) * 100)}%`
        }
        labelLine={false}
      >
        {data.map((d, i) => (
          <Cell key={d.name} fill={colorFor(d.name, i, colorLookup)} />
        ))}
      </Pie>
      <Tooltip content={tooltip} />
      <Legend formatter={(v: string) => prettify(v)} iconType="circle" />
    </PieChart>
  );
}

/** Horizontal bar chart for `[{name,value}]` (rankings: revenue by property, etc.). */
export function hbar({
  data,
  color,
  tooltip,
  isMobile,
  valueTickFormat,
  colorLookup,
}: {
  data: NamedValue[];
  color: string;
  tooltip: ReactElement;
  isMobile: boolean;
  valueTickFormat?: (v: number) => string;
  /** Per-bar colors keyed by name (else the flat `color`). */
  colorLookup?: Record<string, string>;
}): ReactElement {
  return (
    <BarChart data={data} layout="vertical" margin={{ top: 4, right: 20, bottom: 4, left: 4 }}>
      <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
      <XAxis type="number" tick={AXIS_TICK} tickFormatter={valueTickFormat} />
      <YAxis
        type="category"
        dataKey="name"
        width={isMobile ? 88 : 132}
        tick={{ ...AXIS_TICK }}
        tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
      />
      <Tooltip content={tooltip} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
      <Bar dataKey="value" radius={[0, 4, 4, 0]} fill={color}>
        {colorLookup &&
          data.map((d, i) => <Cell key={d.name} fill={colorFor(d.name, i, colorLookup)} />)}
      </Bar>
    </BarChart>
  );
}
