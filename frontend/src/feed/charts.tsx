import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  ComposedChart,
  Pie,
  PieChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
// ChartCard and the tooltip primitives are generic chart infrastructure that
// happens to live under `analytics/` (the first module that needed them). Reused
// here rather than duplicated, so both consoles get the same CSV/PNG export and
// the same accessible "view as table" fallback.
import { ChartCard } from '../analytics/charts/ChartCard';
import { MoneyTooltip, type ChartTooltipProps } from '../analytics/charts/primitives';
import { EXPIRY_BUCKET_COLOR, FEED_COLORS, SPECIES_COLOR } from './constants';
import { bucketSeries, compactMoney, isEmptySeries, shortPeriod, totalSold, units } from './compute';
import type { FeedBucket, FeedNamedTotal, FeedPeriod, Species } from './types';

const AXIS_TICK = { fontSize: 11, fill: '#64748b' } as const;
const GRID_STROKE = '#e2e8f0';

/**
 * Tooltip for series measured in whole packages.
 *
 * Recharts' own `formatter`/`labelFormatter` props are typed against its loose
 * internal `ValueType`/`ReactNode` shapes and are ignored anyway once custom
 * `content` is supplied — so the app formats through its own strictly-typed
 * content element instead, the same way `analytics/charts/primitives` does.
 */
function UnitsTooltip({ active, label, payload, labelFormat }: ChartTooltipProps): ReactElement | null {
  if (!active || !payload?.length) return null;
  const heading = label === undefined || label === '' ? '' : labelFormat ? labelFormat(String(label)) : label;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      {heading !== '' && <div className="mb-1 font-semibold text-slate-700">{heading}</div>}
      {payload.map((entry, index) => (
        <div key={index} className="flex items-center gap-2 text-slate-600">
          <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span>{String(entry.name ?? '')}</span>
          <span className="ml-auto font-semibold text-slate-800">
            {typeof entry.value === 'number' ? units(entry.value) : entry.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * Units sold per month with revenue overlaid.
 *
 * Two axes on purpose: volume and money move on different scales, and the point
 * of the chart is whether they move *together* — a month where units rise but
 * revenue doesn't is a discounting problem worth seeing.
 */
export function SalesTrendChart({ rows }: { rows: FeedPeriod[] }): ReactElement {
  return (
    <ChartCard
      title="Sales trend"
      subtitle="Units sold and revenue by month"
      full
      empty={totalSold(rows) === 0}
      emptyMessage="No sales recorded in this window."
      exportRows={{ filename: 'feed-sales-trend', rows }}
    >
      <ComposedChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={AXIS_TICK} tickLine={false} />
        <YAxis yAxisId="units" tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <YAxis
          yAxisId="money"
          orientation="right"
          tickFormatter={compactMoney}
          tick={AXIS_TICK}
          tickLine={false}
          axisLine={false}
          width={56}
        />
        <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar
          yAxisId="units"
          dataKey="units_sold"
          name="Units sold"
          fill={FEED_COLORS.leaf}
          radius={[4, 4, 0, 0]}
        />
        <Line
          yAxisId="money"
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={FEED_COLORS.amber}
          strokeWidth={2}
          dot={false}
        />
      </ComposedChart>
    </ChartCard>
  );
}

/** Revenue against cost of goods, so the gap (gross margin) is the visual. */
export function MarginChart({ rows }: { rows: FeedPeriod[] }): ReactElement {
  return (
    <ChartCard
      title="Revenue vs cost"
      subtitle="The gap is gross margin"
      empty={rows.every((r) => !r.revenue && !r.cogs)}
      emptyMessage="No revenue recorded in this window."
      exportRows={{ filename: 'feed-margin', rows }}
    >
      <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={AXIS_TICK} tickLine={false} />
        <YAxis tickFormatter={compactMoney} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Area
          type="monotone"
          dataKey="revenue"
          name="Revenue"
          stroke={FEED_COLORS.green}
          fill={FEED_COLORS.leaf}
          fillOpacity={0.25}
        />
        <Area
          type="monotone"
          dataKey="cogs"
          name="Cost of goods"
          stroke={FEED_COLORS.clay}
          fill={FEED_COLORS.clay}
          fillOpacity={0.2}
        />
      </AreaChart>
    </ChartCard>
  );
}

/**
 * Stock value by shelf life remaining.
 *
 * Value, not units: the question this answers is "how much money is about to
 * walk out of the door", and a cheap bucket of minerals is not the same risk as
 * a pallet of broiler starter.
 */
export function ExpiryChart({ buckets }: { buckets: Record<string, FeedBucket> }): ReactElement {
  const rows = bucketSeries(buckets);
  return (
    <ChartCard
      title="Stock by shelf life"
      subtitle="Value at cost, by days until expiry"
      empty={isEmptySeries(rows)}
      emptyMessage="No stock on hand."
      exportRows={{ filename: 'feed-expiry-buckets', rows }}
    >
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="bucket" tick={AXIS_TICK} tickLine={false} />
        <YAxis tickFormatter={compactMoney} tick={AXIS_TICK} tickLine={false} axisLine={false} width={56} />
        <Tooltip content={<MoneyTooltip />} />
        <Bar dataKey="value" name="Stock value" radius={[4, 4, 0, 0]}>
          {rows.map((row) => (
            <Cell key={row.bucket} fill={EXPIRY_BUCKET_COLOR[row.bucket] ?? FEED_COLORS.slate} />
          ))}
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

/** Where the inventory money sits, by livestock line. */
export function SpeciesMixChart({ rows }: { rows: FeedNamedTotal[] }): ReactElement {
  return (
    <ChartCard
      title="Stock value by species"
      subtitle="Share of capital tied up per line"
      empty={isEmptySeries(rows)}
      emptyMessage="No stock on hand."
      exportRows={{ filename: 'feed-species-mix', rows }}
    >
      <PieChart>
        <Tooltip content={<MoneyTooltip />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Pie
          data={rows}
          dataKey="value"
          nameKey="name"
          innerRadius="45%"
          outerRadius="75%"
          paddingAngle={2}
        >
          {rows.map((row, index) => (
            <Cell
              key={row.name}
              fill={SPECIES_COLOR[row.name as Species] ?? Object.values(FEED_COLORS)[index % 8]}
            />
          ))}
        </Pie>
      </PieChart>
    </ChartCard>
  );
}

/** Best sellers by volume over the charted window. */
export function TopSellersChart({ rows }: { rows: FeedNamedTotal[] }): ReactElement {
  const top = rows.slice(0, 8);
  return (
    <ChartCard
      title="Top sellers"
      subtitle="Units sold in the charted window"
      empty={isEmptySeries(top)}
      emptyMessage="No sales recorded in this window."
      exportRows={{ filename: 'feed-top-sellers', rows: top }}
      height={Math.max(220, top.length * 34 + 40)}
    >
      <BarChart data={top} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }}>
        <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
        <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={false} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ ...AXIS_TICK, fontSize: 10 }}
          tickLine={false}
          axisLine={false}
          width={140}
        />
        <Tooltip content={<UnitsTooltip />} />
        <Bar dataKey="units" name="Units sold" fill={FEED_COLORS.green} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ChartCard>
  );
}

/** Per-product movement history for the drill-down view. */
export function ProductMovementChart({ rows }: { rows: FeedPeriod[] }): ReactElement {
  return (
    <ChartCard
      title="Stock movement"
      subtitle="Units received, sold and written off by month"
      full
      empty={rows.every((r) => !r.units_in && !r.units_sold && !r.units_written_off)}
      emptyMessage="No movements recorded in this window."
      exportRows={{ filename: 'feed-product-movement', rows }}
    >
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID_STROKE} vertical={false} />
        <XAxis dataKey="period" tickFormatter={shortPeriod} tick={AXIS_TICK} tickLine={false} />
        <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} />
        <Tooltip content={<UnitsTooltip labelFormat={shortPeriod} />} />
        <Legend wrapperStyle={{ fontSize: 11 }} />
        <Bar dataKey="units_in" name="Received" fill={FEED_COLORS.blue} radius={[4, 4, 0, 0]} />
        <Bar dataKey="units_sold" name="Sold" fill={FEED_COLORS.leaf} radius={[4, 4, 0, 0]} />
        <Bar dataKey="units_written_off" name="Written off" fill={FEED_COLORS.red} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartCard>
  );
}
