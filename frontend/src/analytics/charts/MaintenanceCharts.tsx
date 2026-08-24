import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { WorkOrder } from '../../data/types';
import { countBy, daysBetween, histogram, perStaffOnTime, sumByPeriod } from '../compute';
import { AXIS_TICK, compactMoney, GRID_STROKE, HARMAAL, PRIORITY_COLORS, STATUS_COLORS, shortPeriod } from '../theme';
import { ChartCard } from './ChartCard';
import { axisInterval } from './axis';
import { donut, hbar } from './builders';
import { CountTooltip, MoneyTooltip } from './primitives';

export function MaintenanceCharts({
  workOrders,
  isMobile,
}: {
  workOrders: WorkOrder[];
  isMobile: boolean;
}): ReactElement {
  const byStatus = useMemo(() => countBy(workOrders, (w) => w.status), [workOrders]);
  const byCategory = useMemo(
    () => countBy(workOrders, (w) => w.category).map((d) => ({ name: d.name, value: d.value })),
    [workOrders],
  );
  const byPriority = useMemo(() => countBy(workOrders, (w) => w.priority), [workOrders]);

  const spend = useMemo(
    () =>
      sumByPeriod(
        workOrders.filter((w) => w.completed_at && w.cost),
        (w) => w.completed_at,
        (w) => w.cost ?? 0,
      ),
    [workOrders],
  );

  const staff = useMemo(() => perStaffOnTime(workOrders), [workOrders]);
  const completedPerStaff = useMemo(
    () => staff.map((s) => ({ name: s.staff, value: s.completed })),
    [staff],
  );
  const onTimePerStaff = useMemo(
    () =>
      staff
        .filter((s) => s.scheduledCount > 0)
        .map((s) => ({ name: s.staff, onTime: s.onTime, late: s.late })),
    [staff],
  );
  const cyclePerStaff = useMemo(
    () =>
      staff
        .filter((s) => s.avgDaysToComplete !== null)
        .map((s) => ({ name: s.staff, value: Math.round((s.avgDaysToComplete ?? 0) * 10) / 10 })),
    [staff],
  );

  const cycleHist = useMemo(
    () =>
      histogram(
        workOrders
          .filter((w) => w.status === 'completed' && w.completed_at && w.created_at)
          .map((w) => daysBetween(w.created_at, w.completed_at)),
        isMobile ? 8 : 14,
      ),
    [workOrders, isMobile],
  );

  const noWO = workOrders.length === 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Work orders by status"
        subtitle="Current state of every job in range"
        empty={noWO}
        exportRows={{ filename: 'work-orders-by-status', rows: byStatus }}
      >
        {donut({ data: byStatus, tooltip: <CountTooltip />, isMobile, colorLookup: STATUS_COLORS })}
      </ChartCard>

      <ChartCard
        title="Work orders by priority"
        subtitle="Urgency mix"
        empty={noWO}
        exportRows={{ filename: 'work-orders-by-priority', rows: byPriority }}
      >
        {donut({ data: byPriority, tooltip: <CountTooltip />, isMobile, colorLookup: PRIORITY_COLORS })}
      </ChartCard>

      <ChartCard
        title="Work orders by category"
        subtitle="What breaks most"
        empty={byCategory.length === 0}
        exportRows={{ filename: 'work-orders-by-category', rows: byCategory }}
      >
        {hbar({ data: byCategory, color: HARMAAL.blue, tooltip: <CountTooltip />, isMobile })}
      </ChartCard>

      <ChartCard
        title="Jobs completed per staff"
        subtitle="Throughput by assignee"
        empty={completedPerStaff.length === 0}
        exportRows={{ filename: 'jobs-completed-per-staff', rows: completedPerStaff }}
      >
        {hbar({ data: completedPerStaff, color: HARMAAL.earth, tooltip: <CountTooltip />, isMobile })}
      </ChartCard>

      <ChartCard
        title="Avg days to complete per staff"
        subtitle="Cycle time from creation to completion"
        empty={cyclePerStaff.length === 0}
        exportRows={{ filename: 'avg-cycle-time-per-staff', rows: cyclePerStaff }}
      >
        {hbar({ data: cyclePerStaff, color: HARMAAL.blue, tooltip: <CountTooltip />, isMobile })}
      </ChartCard>

      <ChartCard
        title="On-time completion by staff"
        subtitle="Completed on/before schedule vs late (scheduled jobs only)"
        full
        empty={onTimePerStaff.length === 0}
        emptyMessage="No scheduled work orders in this selection."
        exportRows={{ filename: 'on-time-per-staff', rows: onTimePerStaff }}
      >
        <BarChart data={onTimePerStaff} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={isMobile ? 88 : 130}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => (v.length > 18 ? `${v.slice(0, 17)}…` : v)}
          />
          <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Legend iconType="circle" />
          <Bar dataKey="onTime" name="On time" stackId="s" fill="#16a34a" />
          <Bar dataKey="late" name="Late" stackId="s" fill="#dc2626" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Maintenance spend over time"
        subtitle="Completed work-order costs by month"
        full
        empty={spend.length === 0}
        exportRows={{ filename: 'maintenance-spend', rows: spend }}
      >
        <BarChart data={spend} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={axisInterval(spend.length, isMobile)}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} tickFormatter={compactMoney} width={52} />
          <Tooltip content={<MoneyTooltip labelFormat={shortPeriod} />} />
          <Bar dataKey="total" name="Spend" fill={HARMAAL.gold} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Time to complete"
        subtitle="Days from creation to completion (histogram)"
        full
        empty={cycleHist.length === 0}
        exportRows={{ filename: 'time-to-complete', rows: cycleHist }}
      >
        <BarChart data={cycleHist} margin={{ top: 8, right: 12, bottom: 4, left: 4 }} barCategoryGap={1}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis dataKey="binLabel" tick={{ ...AXIS_TICK, fontSize: 10 }} interval={0} height={30} />
          <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
          <Tooltip content={<CountTooltip labelFormat={(l) => `${l} days`} />} />
          <Bar dataKey="count" name="Work orders" fill={HARMAAL.blue} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
