import { useMemo } from 'react';
import type { ReactElement } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Tooltip, XAxis, YAxis } from 'recharts';
import type { Property } from '../../data/types';
import { AXIS_TICK, GRID_STROKE, HARMAAL } from '../theme';
import { ChartCard } from './ChartCard';
import { donut } from './builders';
import { CountTooltip } from './primitives';

export function OccupancyCharts({
  properties,
  isMobile,
}: {
  /** Already scoped to the selected property (or all). */
  properties: Property[];
  isMobile: boolean;
}): ReactElement {
  const rows = useMemo(
    () =>
      properties.map((p) => {
        const occupied = Math.min(p.tenants.length, p.units);
        const vacant = Math.max(0, p.units - occupied);
        return { name: p.address, occupied, vacant, rate: p.units ? (occupied / p.units) * 100 : 0 };
      }),
    [properties],
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
      <ChartCard
        title="Occupancy by property"
        subtitle="Occupied vs vacant units"
        full
        empty={noData}
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

      <ChartCard title="Portfolio occupancy" subtitle="All units, occupied vs vacant" empty={portfolioEmpty}>
        {donut({
          data: portfolio,
          tooltip: <CountTooltip />,
          isMobile,
          colorLookup: { Occupied: HARMAAL.blue, Vacant: '#cbd5e1' },
        })}
      </ChartCard>
    </div>
  );
}
