import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMaintenanceDashboard, listWorkOrders } from '../data/api';
import type { MaintenanceDashboard as MaintData, WorkOrder } from '../data/types';
import { Badge, Card, EmptyState, Loading, PageHeader, StatCard } from '../components/ui';

export default function MaintenanceDashboard() {
  const [data, setData] = useState<MaintData | null>(null);
  const [orders, setOrders] = useState<WorkOrder[]>([]);

  useEffect(() => {
    getMaintenanceDashboard().then(setData).catch(() => setData(null));
    listWorkOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  if (!data) return <Loading />;

  const active = orders.filter((o) => o.status !== 'completed' && o.status !== 'cancelled');

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <PageHeader title="My Work" subtitle="Jobs assigned to you." />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="To Do" value={data.open_count} tone={data.open_count > 0 ? 'warn' : 'good'} />
        <StatCard label="In Progress" value={data.in_progress_count} />
        <StatCard label="Completed" value={data.completed_count} tone="good" />
      </div>

      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-slate-800">Active jobs</h2>
          <Link to="/work-orders" className="text-sm text-blue-600 font-semibold hover:underline">
            All work orders →
          </Link>
        </div>
        {active.length === 0 ? (
          <EmptyState>Nothing assigned right now.</EmptyState>
        ) : (
          <div className="divide-y divide-slate-50">
            {active.map((o) => (
              <Link
                key={o.id}
                to={`/work-orders/${o.id}`}
                className="flex items-center justify-between py-3 hover:bg-slate-50 rounded-lg px-2 -mx-2"
              >
                <div>
                  <div className="font-semibold text-slate-800">{o.title}</div>
                  <div className="text-xs text-slate-400">
                    {o.property_address} · {o.unit_label}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge value={o.priority} />
                  <Badge value={o.status} />
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
