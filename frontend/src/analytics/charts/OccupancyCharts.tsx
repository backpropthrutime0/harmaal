import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { Property } from '../../data/types';
import { daysBetween, isLeaseActive, leaseExpiryByMonth } from '../compute';
import { AXIS_TICK, GRID_STROKE, HARMAAL, shortPeriod } from '../theme';
import { ChartCard } from './ChartCard';
import { donut } from './builders';
import { CountTooltip } from './primitives';

export function OccupancyCharts({
  properties,
  refDate,
  isMobile,
}: {
  /** Already scoped to the selected property (or all). */
  properties: Property[];
  /** Point-in-time date ('YYYY-MM-DD') at which to count active leases. */
  refDate: string;
  isMobile: boolean;
}): ReactElement {
  const rows = useMemo(
    () =>
      properties.map((p) => {
        const occupied = Math.min(p.tenants.filter((t) => isLeaseActive(t, refDate)).length, p.units);
        const vacant = Math.max(0, p.units - occupied);
        return { name: p.address, occupied, vacant, rate: p.units ? (occupied / p.units) * 100 : 0 };
      }),
    [properties, refDate],
  );

  const portfolio = useMemo(() => {
    const occupied = rows.reduce((s, r) => s + r.occupied, 0);
    const vacant = rows.reduce((s, r) => s + r.vacant, 0);
    return [
      { name: 'Occupied', value: occupied },
      { name: 'Vacant', value: vacant },
    ];
  }, [rows]);

  const noData = rows.length === 0;
  // A property with 0 units yields an all-zero pie (recharts draws no arcs).
  const portfolioEmpty = noData || portfolio.every((p) => p.value === 0);

  // Upcoming lease expiries (renewals/vacancies) — always forward-looking from
  // today, independent of the selected range.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const leases = useMemo(() => properties.flatMap((p) => p.tenants), [properties]);
  const expiry = useMemo(() => leaseExpiryByMonth(leases, today.slice(0, 7), 12), [leases, today]);
  const expiringSoon = useMemo(
    () =>
      leases.filter((l) => {
        const d = daysBetween(today, l.lease_end_date);
        return d >= 0 && d <= 60;
      }).length,
    [leases, today],
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Occupancy by property"
        subtitle={`Occupied vs vacant units (as of ${refDate})`}
        full
        empty={noData}
        exportRows={{ filename: 'occupancy-by-property', rows }}
      >
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
          <XAxis type="number" tick={AXIS_TICK} allowDecimals={false} />
          <YAxis
            type="category"
            dataKey="name"
            width={isMobile ? 96 : 150}
            tick={AXIS_TICK}
            tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
          />
          <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(15,23,42,0.04)' }} />
          <Legend iconType="circle" />
          <Bar dataKey="occupied" name="Occupied" stackId="u" fill={HARMAAL.blue} />
          <Bar dataKey="vacant" name="Vacant" stackId="u" fill="#cbd5e1" radius={[0, 4, 4, 0]} />
        </BarChart>
      </ChartCard>

      <ChartCard
        title="Portfolio occupancy"
        subtitle={`All units, occupied vs vacant (as of ${refDate})`}
        empty={portfolioEmpty}
        exportRows={{ filename: 'portfolio-occupancy', rows: portfolio }}
      >
        {donut({
          data: portfolio,
          tooltip: <CountTooltip />,
          isMobile,
          colorLookup: { Occupied: HARMAAL.blue, Vacant: '#cbd5e1' },
        })}
      </ChartCard>

      <ChartCard
        title="Lease expiries — next 12 months"
        subtitle={`Renewals/vacancies coming up · ${expiringSoon} expiring within 60 days`}
        full
        empty={leases.length === 0}
        exportRows={{ filename: 'lease-expiries', rows: expiry }}
      >
        <BarChart data={expiry} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
          <CartesianGrid stroke={GRID_STROKE} vertical={false} />
          <XAxis
            dataKey="period"
            tick={AXIS_TICK}
            tickFormatter={shortPeriod}
            interval={0}
            angle={isMobile ? -45 : 0}
            textAnchor={isMobile ? 'end' : 'middle'}
            height={isMobile ? 48 : 30}
          />
          <YAxis tick={AXIS_TICK} allowDecimals={false} width={36} />
          <Tooltip content={<CountTooltip labelFormat={shortPeriod} />} />
          <Bar dataKey="count" name="Leases ending" fill={HARMAAL.gold} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}
