import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ChargeRow, Expense, MonthlyFinancials, WorkOrder } from '../../data/types';
import { EXPENSE_CATEGORIES } from '../../data/types';
import { periodOf, sumBy } from '../compute';
import { AXIS_TICK, CATEGORY_COLORS, colorFor, compactMoney, GRID_STROKE, HARMAAL, shortPeriod } from '../theme';
import { ChartCard } from './ChartCard';
import { donut } from './builders';
import { MoneyTooltip } from './primitives';

function axisInterval(count: number, isMobile: boolean): number {
  const target = isMobile ? 6 : 12;
  return count > target ? Math.ceil(count / target) - 1 : 0;
}

export function ProfitCharts({
  charges,
  expenses,
  workOrders,
  monthly,
  isMobile,
}: {
  charges: ChargeRow[];
  expenses: Expense[];
  workOrders: WorkOrder[];
  /** Already clipped to the date range (portfolio-wide — ignores property/tenant). */
  monthly: MonthlyFinancials[];
  isMobile: boolean;
}): ReactElement {
  const trend = useMemo(() => {
    const m = new Map<string, { revenue: number; expenses: number; wo: number }>();
    const get = (p: string) => {
      let r = m.get(p);
      if (!r) {
        r = { revenue: 0, expenses: 0, wo: 0 };
        m.set(p, r);
      }
      return r;
    };
    for (const c of charges) if (c.status === 'paid') get(c.period).revenue += c.amount;
    for (const e of expenses) get(e.period).expenses += e.amount;
    for (const w of workOrders) if (w.completed_at && w.cost) get(periodOf(w.completed_at)).wo += w.cost;
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, v]) => ({
        period,
        revenue: v.revenue,
        costs: v.expenses + v.wo,
        profit: v.revenue - v.expenses - v.wo,
      }));
  }, [charges, expenses, workOrders]);

  const byCategory = useMemo(
    () => sumBy(expenses, (e) => e.category, (e) => e.amount),
    [expenses],
  );

  // Union of the canonical categories and any others actually present, so the
  // stacked chart never silently drops spend (and reconciles with the donut).
  const categories = useMemo(() => {
    const set = new Set<string>(EXPENSE_CATEGORIES);
    for (const e of expenses) set.add(e.category);
    return [...set];
  }, [expenses]);

  const catTrend = useMemo(() => {
    const m = new Map<string, Record<string, number>>();
    for (const e of expenses) {
      const row = m.get(e.period) ?? {};
      row[e.category] = (row[e.category] ?? 0) + e.amount;
      m.set(e.period, row);
    }
    return [...m.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([period, row]) => {
        const out: Record<string, number | string> = { period };
        for (const c of categories) out[c] = row[c] ?? 0;
        return out;
      });
  }, [expenses, categories]);

  const cash = useMemo(
    () =>
      monthly
        .slice()
        .sort((a, b) => (a.period < b.period ? -1 : 1))
        .map((m) => ({ period: m.period, cash_on_hand: m.cash_on_hand })),
    [monthly],
  );

  const interval = axisInterval(trend.length, isMobile);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Profit trend"
        subtitle="Collected rent − expenses − maintenance costs, by month"
        full
        empty={trend.length === 0}
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
          <Bar name="Revenue" dataKey="revenue" fill={HARMAAL.blue} radius={[3, 3, 0, 0]} />
          <Bar name="Costs" dataKey="costs" fill={HARMAAL.earth} radius={[3, 3, 0, 0]} />
          <Line name="Net profit" type="monotone" dataKey="profit" stroke="#16a34a" strokeWidth={2} dot={false} />
        </ComposedChart>
      </ChartCard>

      <ChartCard title="Expenses by category" subtitle="Where the money goes" empty={byCategory.length === 0}>
        {donut({ data: byCategory, tooltip: <MoneyTooltip />, isMobile, colorLookup: CATEGORY_COLORS })}
      </ChartCard>

      <ChartCard title="Cash on hand" subtitle="Portfolio-wide — ignores property/tenant filters" empty={cash.length === 0}>
        <AreaChart data={cash} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={axisInterval(cash.length, isMobile)}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
          <Area type="monotone" dataKey="cash_on_hand" name="Cash on hand" stroke={HARMAAL.gold} fill={HARMAAL.gold} fillOpacity={0.2} strokeWidth={2} />
        </AreaChart>
      </ChartCard>

      <ChartCard
        title="Expense breakdown over time"
        subtitle="Monthly expenses stacked by category"
        full
        empty={catTrend.length === 0}
      >
        <BarChart data={catTrend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={axisInterval(catTrend.length, isMobile)}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
          <Legend iconType="circle" />
          {categories.map((c, i) => (
            <Bar key={c} dataKey={c} stackId="exp" name={c} fill={colorFor(c, i, CATEGORY_COLORS)} />
          ))}
        </BarChart>
      </ChartCard>
    </div>
  );
}
