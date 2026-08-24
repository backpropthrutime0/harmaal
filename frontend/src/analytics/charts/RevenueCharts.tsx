import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChargeRow } from '../../data/types';
import { countBy, sumBy } from '../compute';
import { AXIS_TICK, compactMoney, GRID_STROKE, HARMAAL, STATUS_COLORS, shortPeriod } from '../theme';
import { ChartCard } from './ChartCard';
import { axisInterval } from './axis';
import { donut, hbar } from './builders';
import { CountTooltip, MoneyTooltip, PercentTooltip } from './primitives';

interface PeriodRevenue {
  period: string;
  due: number;
  collected: number;
  rate: number | null;
}

export function RevenueCharts({
  charges,
  isMobile,
  onSelectProperty,
}: {
  charges: ChargeRow[];
  isMobile: boolean;
  onSelectProperty?: (address: string) => void;
}): ReactElement {
  const trend = useMemo<PeriodRevenue[]>(() => {
    const byPeriod = new Map<string, { due: number; collected: number }>();
    for (const c of charges) {
      const row = byPeriod.get(c.period) ?? { due: 0, collected: 0 };
      row.due += c.amount;
      if (c.status === 'paid') row.collected += c.amount;
      byPeriod.set(c.period, row);
    }
    return [...byPeriod.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, v]) => ({
        period,
        due: v.due,
        collected: v.collected,
        rate: v.due > 0 ? (v.collected / v.due) * 100 : null,
      }));
  }, [charges]);

  const paid = useMemo(() => charges.filter((c) => c.status === 'paid'), [charges]);

  const byProperty = useMemo(
    () => sumBy(paid, (c) => c.property_address ?? 'Unknown', (c) => c.amount).slice(0, 10),
    [paid],
  );
  const byMethod = useMemo(
    () => sumBy(paid, (c) => c.method ?? 'unknown', (c) => c.amount),
    [paid],
  );
  const byStatus = useMemo(() => countBy(charges, (c) => c.status), [charges]);

  const interval = axisInterval(trend.length, isMobile);
  const noData = charges.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Revenue — billed vs collected"
        subtitle="Rent charged versus rent actually paid, by month"
        full
        empty={noData}
        exportRows={{ filename: 'revenue-billed-vs-collected', rows: trend }}
      >
        <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={interval}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
          <Legend iconType="circle" />
          <Bar name="Billed" dataKey="due" fill={HARMAAL.earth} radius={[3, 3, 0, 0]} />
          <Bar name="Collected" dataKey="collected" fill={HARMAAL.blue} radius={[3, 3, 0, 0]} />
        </ComposedChart>
      </ChartCard>

      <ChartCard
        title="Collection rate"
        subtitle="Share of billed rent collected each month (95% target)"
        full
        empty={noData}
        exportRows={{ filename: 'collection-rate', rows: trend }}
      >
        <LineChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={interval}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={44} />
          <Tooltip content={<PercentTooltip labelFormat={shortPeriod} />} />
          <ReferenceLine y={95} stroke={HARMAAL.gold} strokeDasharray="4 4" />
          <Line
            name="Collection rate"
            type="monotone"
            dataKey="rate"
            stroke={HARMAAL.blue}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ChartCard>

      <ChartCard
        title="Revenue by property"
        subtitle={onSelectProperty ? 'Total collected · click a bar to filter' : 'Total collected, top properties'}
        empty={byProperty.length === 0}
        exportRows={{ filename: 'revenue-by-property', rows: byProperty }}
      >
        {hbar({
          data: byProperty,
          color: HARMAAL.blue,
          tooltip: <MoneyTooltip />,
          isMobile,
          valueTickFormat: compactMoney,
          onSelect: onSelectProperty,
        })}
      </ChartCard>

      <ChartCard
        title="Payment method mix"
        subtitle="Collected rent by how it was paid"
        empty={byMethod.length === 0}
        exportRows={{ filename: 'payment-method-mix', rows: byMethod }}
      >
        {donut({ data: byMethod, tooltip: <MoneyTooltip />, isMobile })}
      </ChartCard>

      <ChartCard
        title="Charge status"
        subtitle="Every charge in range by paid / pending / overdue"
        empty={byStatus.length === 0}
        exportRows={{ filename: 'charge-status', rows: byStatus }}
      >
        {donut({ data: byStatus, tooltip: <CountTooltip />, isMobile, colorLookup: STATUS_COLORS })}
      </ChartCard>
    </div>
  );
}
