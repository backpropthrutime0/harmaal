import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChargeRow, Tenant } from '../../data/types';
import { classifyLate, histogram, kde, tenantLateStats } from '../compute';
import { AXIS_TICK, GRID_STROKE, HARMAAL } from '../theme';
import { ChartCard } from './ChartCard';
import { hbar } from './builders';
import { CountTooltip } from './primitives';

export function TenantCharts({
  charges,
  tenants,
  isMobile,
}: {
  charges: ChargeRow[];
  /** Already scoped to the selected property. */
  tenants: Tenant[];
  isMobile: boolean;
}): ReactElement {
  // Days relative to the due date for every *paid* charge (negative = early).
  const daysLate = useMemo(
    () =>
      charges
        .map((c) => classifyLate(c))
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .map((x) => x.daysLate),
    [charges],
  );

  const lateHist = useMemo(() => histogram(daysLate, isMobile ? 8 : 15), [daysLate, isMobile]);
  const lateDensity = useMemo(() => kde(daysLate, 64), [daysLate]);

  const stats = useMemo(() => tenantLateStats(charges), [charges]);
  const topLate = useMemo(
    () =>
      stats
        .filter((s) => s.lateCount > 0)
        .slice(0, 10)
        .map((s) => ({ name: s.tenantName, value: s.lateCount })),
    [stats],
  );
  const punctuality = useMemo(
    () =>
      stats
        .filter((s) => s.paidCount > 0)
        .slice()
        .sort((a, b) => b.paidCount - a.paidCount)
        .slice(0, 10)
        .map((s) => ({ name: s.tenantName, onTime: s.onTimeCount, late: s.lateCount })),
    [stats],
  );

  const rentHist = useMemo(
    () => histogram(tenants.map((t) => t.rent_amount), isMobile ? 6 : 12),
    [tenants, isMobile],
  );

  const noPayments = daysLate.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Payment timing — histogram"
        subtitle="Days between due date and payment (0 = on time)"
        empty={noPayments}
      >
        <BarChart data={lateHist} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="binLabel" tick={{ ...AXIS_TICK, fontSize: 10 }} interval={0} height={30} />
          <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
          <Tooltip content={<CountTooltip />} />
          <Bar dataKey="count" name="Charges" fill={HARMAAL.blue} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Payment timing — density"
        subtitle="Smoothed distribution (KDE) of days to pay"
        empty={noPayments}
      >
        <AreaChart data={lateDensity} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="x"
            type="number"
            domain={['dataMin', 'dataMax']}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => `${Math.round(v)}`}
            height={30}
          />
          <YAxis tick={AXIS_TICK} width={40} tickFormatter={(v: number) => v.toFixed(3)} />
          <Tooltip
            formatter={(v) => [Number(v).toFixed(4), 'density']}
            labelFormatter={(l) => `${Math.round(Number(l))} days`}
          />
          <ReferenceLine x={0} stroke={HARMAAL.gold} strokeDasharray="4 4" />
          <Area type="monotone" dataKey="density" stroke={HARMAAL.blue} fill={HARMAAL.blue} fillOpacity={0.18} strokeWidth={2} />
        </AreaChart>
      </ChartCard>

      <ChartCard
        title="Top late payers"
        subtitle="Tenants ranked by number of late payments"
        empty={topLate.length === 0}
        emptyMessage="No late payments in this selection. 🎉"
      >
        {hbar({ data: topLate, color: '#dc2626', tooltip: <CountTooltip />, isMobile })}
      </ChartCard>

      <ChartCard
        title="On-time vs late per tenant"
        subtitle="Paid charges split by punctuality (top 10 by volume)"
        empty={punctuality.length === 0}
      >
        <BarChart data={punctuality} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={isMobile ? 88 : 120}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => (v.length > 16 ? `${v.slice(0, 15)}…` : v)}
          />
          <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Legend iconType="circle" />
          <Bar dataKey="onTime" name="On time" stackId="p" fill="#16a34a" />
          <Bar dataKey="late" name="Late" stackId="p" fill="#dc2626" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Rent distribution"
        subtitle="How monthly rents are spread across tenants"
        full
        empty={rentHist.length === 0}
      >
        <BarChart data={rentHist} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="binLabel"
            tick={{ ...AXIS_TICK, fontSize: 10 }}
            interval={0}
            tickFormatter={(v: string) => `$${v}`}
            height={30}
          />
          <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
          <Tooltip content={<CountTooltip labelFormat={(l) => `$${l}`} />} />
          <Bar dataKey="count" name="Tenants" fill={HARMAAL.earth} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
