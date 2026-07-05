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
    // `expenses` (operating: utilities/insurance/operating-maintenance) and `wo`
    // (repair-job costs) are disjoint streams — a WO cost is never also an Expense
    // row — so `costs = expenses + wo` is the full cost base, not a double count.
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

  // Revenue vs total costs per property (expenses + repair-job costs — the same
  // disjoint streams as the profit trend). Grouped by property_address, which all
  // three sources carry.
  const perProperty = useMemo(() => {
    const m = new Map<string, { revenue: number; cost: number }>();
    const get = (k: string) => {
      let r = m.get(k);
      if (!r) {
        r = { revenue: 0, cost: 0 };
        m.set(k, r);
      }
      return r;
    };
    for (const c of charges) if (c.status === 'paid') get(c.property_address ?? 'Unknown').revenue += c.amount;
    for (const e of expenses) get(e.property_address ?? 'Unknown').cost += e.amount;
    for (const w of workOrders) if (w.completed_at && w.cost) get(w.property_address ?? 'Unknown').cost += w.cost;
    return [...m.entries()]
      .map(([name, v]) => ({ name, revenue: v.revenue, cost: v.cost, net: v.revenue - v.cost }))
      .sort((a, b) => b.net - a.net);
  }, [charges, expenses, workOrders]);

  const undeposited = useMemo(
    () =>
      monthly
        .slice()
        .sort((a, b) => (a.period < b.period ? -1 : 1))
        .map((m) => ({ period: m.period, undeposited: Math.max(0, m.cash_collected - m.cash_deposited) })),
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
        exportRows={{ filename: 'profit-trend', rows: trend }}
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

      <ChartCard
        title="Per-property P&L"
        subtitle="Collected revenue vs total costs, by property"
        full
        empty={perProperty.length === 0}
        exportRows={{ filename: 'per-property-pl', rows: perProperty }}
      >
        <BarChart data={perProperty} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} tickFormatter={compactMoney} />
          <YAxis
            type="category"
            dataKey="name"
            width={isMobile ? 96 : 150}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <Tooltip content={<MoneyTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Legend iconType="circle" />
          <Bar dataKey="revenue" name="Revenue" fill={HARMAAL.blue} radius={[0, 3, 3, 0]} />
          <Bar dataKey="cost" name="Costs" fill={HARMAAL.earth} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Expenses by category"
        subtitle="Where the money goes"
        empty={byCategory.length === 0}
        exportRows={{ filename: 'expenses-by-category', rows: byCategory }}
      >
        {donut({ data: byCategory, tooltip: <MoneyTooltip />, isMobile, colorLookup: CATEGORY_COLORS })}
      </ChartCard>

      <ChartCard
        title="Undeposited cash"
        subtitle="Cash collected but not yet banked — portfolio-wide"
        empty={undeposited.length === 0}
        exportRows={{ filename: 'undeposited-cash', rows: undeposited }}
      >
        <AreaChart data={undeposited} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={axisInterval(undeposited.length, isMobile)}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
          <Area type="monotone" dataKey="undeposited" name="Undeposited" stroke="#dc2626" fill="#dc2626" fillOpacity={0.15} strokeWidth={2} />
        </AreaChart>
      </ChartCard>

      <ChartCard
        title="Cash on hand"
        subtitle="Portfolio-wide — ignores property/tenant filters"
        empty={cash.length === 0}
        exportRows={{ filename: 'cash-on-hand', rows: cash }}
      >
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
        exportRows={{ filename: 'expense-breakdown', rows: catTrend }}
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
