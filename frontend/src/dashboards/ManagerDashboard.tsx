import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getManagerDashboard } from '../data/api';
import type { ManagerDashboard as ManagerData } from '../data/types';
import { Card, EmptyState, Loading, PageHeader, StatCard, money } from '../components/ui';
import { MonthlyFinancials } from './MonthlyFinancials';

export default function ManagerDashboard() {
  const [data, setData] = useState<ManagerData | null>(null);

  useEffect(() => {
    getManagerDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Loading />;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Operations Dashboard" subtitle="Rent collection and maintenance at a glance." />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Due This Month" value={money(data.due_this_month)} />
        <StatCard label="Collected This Month" value={money(data.collected_this_month)} tone="good" />
        <StatCard label="Overdue Total" value={money(data.overdue_total)} tone={data.overdue_total > 0 ? 'bad' : 'good'} />
        <StatCard label="Open Work Orders" value={data.open_work_orders} tone={data.open_work_orders > 0 ? 'warn' : 'good'} />
      </div>

      <div className="mb-6">
        <MonthlyFinancials />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">Overdue Tenants — follow up</h2>
            <Link to="/financials" className="text-sm text-blue-600 font-semibold hover:underline">
              Rent roll →
            </Link>
          </div>
          {data.overdue.length === 0 ? (
            <EmptyState>No overdue tenants. 🎉</EmptyState>
          ) : (
            <div className="space-y-3">
              {data.overdue.map((o) => (
                <div key={o.tenant_id} className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <div>
                    <div className="font-semibold text-slate-800">{o.name}</div>
                    <div className="text-xs text-slate-400">
                      {o.unit_label} · {o.property_address}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-red-600">{money(o.amount)}</div>
                    <div className="text-xs text-slate-400">{o.months_overdue} month(s)</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-slate-800">Work Orders by Status</h2>
            <Link to="/work-orders" className="text-sm text-blue-600 font-semibold hover:underline">
              Manage →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {Object.entries(data.work_orders_by_status).map(([status, count]) => (
              <div key={status} className="bg-slate-50 rounded-xl p-4">
                <div className="text-2xl font-bold text-slate-800">{count}</div>
                <div className="text-xs text-slate-500 capitalize">{status.replace('_', ' ')}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
