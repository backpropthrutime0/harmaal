import { useEffect, useState } from 'react';
import { getAdminDashboard } from '../data/api';
import type { AdminDashboard as AdminData } from '../data/types';
import { Card, Loading, PageHeader, StatCard, money } from '../components/ui';

export default function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Loading />;

  const collectionRate =
    data.billed_this_month > 0 ? Math.round((data.collected_this_month / data.billed_this_month) * 100) : 0;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Owner Dashboard" subtitle="Portfolio-wide overview across all properties." />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <StatCard label="Properties" value={data.total_properties} sub={`${data.total_units} units`} />
        <StatCard
          label="Occupancy"
          value={`${data.occupancy_rate}%`}
          sub={`${data.occupied_units}/${data.total_units} occupied`}
        />
        <StatCard label="Tenants" value={data.total_tenants} />
        <StatCard label="Billed (this month)" value={money(data.billed_this_month)} />
        <StatCard
          label="Collected (this month)"
          value={money(data.collected_this_month)}
          sub={`${collectionRate}% collection rate`}
          tone="good"
        />
        <StatCard
          label="Outstanding"
          value={money(data.outstanding)}
          sub={`${data.overdue_count} overdue charges`}
          tone={data.outstanding > 0 ? 'warn' : 'good'}
        />
        <StatCard label="Open Work Orders" value={data.open_work_orders} tone={data.open_work_orders > 0 ? 'warn' : 'good'} />
        <StatCard label="Maintenance Spend (YTD)" value={money(data.maintenance_spend_ytd)} />
      </div>

      <Card className="mt-8 p-6">
        <h2 className="font-bold text-slate-800 mb-2">Owner view</h2>
        <p className="text-slate-500 text-sm">
          As the owner you have read-only oversight of the whole portfolio. Day-to-day operations
          (collecting rent, contacting tenants, dispatching maintenance) are handled by management.
        </p>
      </Card>
    </div>
  );
}
