import { useEffect, useState } from 'react';
import { getAdminDashboard } from '../data/api';
import type { AdminDashboard as AdminData } from '../data/types';
import { Card, Loading, PageHeader, StatCard } from '../components/ui';
import { money } from '../format';
import { AdminDetailModal, type AdminMetric } from './AdminDetailModal';

export default function AdminDashboard() {
  const [data, setData] = useState<AdminData | null>(null);
  const [metric, setMetric] = useState<AdminMetric | null>(null);

  useEffect(() => {
    getAdminDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Loading />;

  const collectionRate =
    data.billed_this_month > 0 ? Math.round((data.collected_this_month / data.billed_this_month) * 100) : 0;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Owner Dashboard"
        subtitle="Portfolio-wide overview across all properties. Click any card for details."
      />

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-6">
        <StatCard
          label="Properties"
          value={data.total_properties}
          sub={`${data.total_units} units`}
          onClick={() => setMetric('properties')}
        />
        <StatCard
          label="Occupancy"
          value={`${data.occupancy_rate}%`}
          sub={`${data.occupied_units}/${data.total_units} occupied`}
          onClick={() => setMetric('occupancy')}
        />
        <StatCard label="Tenants" value={data.total_tenants} onClick={() => setMetric('tenants')} />
        <StatCard
          label="Billed (this month)"
          value={money(data.billed_this_month)}
          onClick={() => setMetric('billed')}
        />
        <StatCard
          label="Collected (this month)"
          value={money(data.collected_this_month)}
          sub={`${collectionRate}% collection rate`}
          tone="good"
          onClick={() => setMetric('collected')}
        />
        <StatCard
          label="Outstanding"
          value={money(data.outstanding)}
          sub={`${data.overdue_count} overdue charges`}
          tone={data.outstanding > 0 ? 'warn' : 'good'}
          onClick={() => setMetric('outstanding')}
        />
        <StatCard
          label="Open Work Orders"
          value={data.open_work_orders}
          tone={data.open_work_orders > 0 ? 'warn' : 'good'}
          onClick={() => setMetric('work_orders')}
        />
        <StatCard
          label="Maintenance Spend (YTD)"
          value={money(data.maintenance_spend_ytd)}
          onClick={() => setMetric('maintenance')}
        />
      </div>

      <Card className="mt-8 p-6">
        <h2 className="font-bold text-slate-800 mb-2">Owner view</h2>
        <p className="text-slate-500 text-sm">
          As the owner you have read-only oversight of the whole portfolio. Day-to-day operations
          (collecting rent, contacting tenants, dispatching maintenance) are handled by management.
        </p>
      </Card>

      <AdminDetailModal metric={metric} onClose={() => setMetric(null)} />
    </div>
  );
}
