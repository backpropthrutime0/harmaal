import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getManagerDashboard, listWorkOrders } from '../data/api';
import type { ManagerDashboard as ManagerData, WorkOrder } from '../data/types';
import { Card, EmptyState, Loading, Modal, PageHeader, StatCard, money } from '../components/ui';
import { MonthlyFinancials } from './MonthlyFinancials';
import { BreakdownView } from './BreakdownView';
import { WorkOrderTable } from './tables';

const OPEN_WO = ['open', 'assigned', 'in_progress'];

/** Drill into work orders grouped by property or tenant, with a spend/period toggle. */
function WorkOrderBreakdownModal({ onClose }: { onClose: () => void }) {
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [view, setView] = useState<'open' | 'spend'>('open');

  useEffect(() => {
    listWorkOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  const open = orders?.filter((w) => OPEN_WO.includes(w.status)) ?? [];
  const completed = orders?.filter((w) => w.cost && w.completed_at) ?? [];

  return (
    <Modal
      open
      onClose={onClose}
      title="Work Orders"
      subtitle="Group by property or tenant, and switch between open jobs and completed spend."
    >
      {!orders ? (
        <Loading />
      ) : (
        <>
          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 mb-5">
            {(['open', 'spend'] as const).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  view === v ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {v === 'open' ? 'Open jobs' : 'Completed spend'}
              </button>
            ))}
          </div>
          {view === 'open' ? (
            <BreakdownView
              rows={open}
              getDate={(w) => w.created_at}
              getAmount={() => 0}
              getProperty={(w) => w.property_address ?? ''}
              getTenant={(w) => w.tenant_name ?? ''}
              renderDetail={(rows) => <WorkOrderTable rows={rows} />}
              countLabel="Open jobs"
              showAmount={false}
              periods={false}
            />
          ) : (
            <BreakdownView
              rows={completed}
              getDate={(w) => w.completed_at}
              getAmount={(w) => w.cost ?? 0}
              getProperty={(w) => w.property_address ?? ''}
              getTenant={(w) => w.tenant_name ?? ''}
              renderDetail={(rows) => <WorkOrderTable rows={rows} showCost />}
              amountLabel="Spend"
              countLabel="Jobs"
              defaultPeriod="year"
            />
          )}
        </>
      )}
    </Modal>
  );
}

export default function ManagerDashboard() {
  const [data, setData] = useState<ManagerData | null>(null);
  const [showWorkOrders, setShowWorkOrders] = useState(false);

  useEffect(() => {
    getManagerDashboard().then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Loading />;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <PageHeader title="Operations Dashboard" subtitle="Rent collection and maintenance at a glance." />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <StatCard label="Due This Month" value={money(data.due_this_month)} />
        <StatCard label="Collected This Month" value={money(data.collected_this_month)} tone="good" />
        <StatCard label="Overdue Total" value={money(data.overdue_total)} tone={data.overdue_total > 0 ? 'bad' : 'good'} />
        <StatCard
          label="Open Work Orders"
          value={data.open_work_orders}
          tone={data.open_work_orders > 0 ? 'warn' : 'good'}
          onClick={() => setShowWorkOrders(true)}
        />
      </div>

      {showWorkOrders && <WorkOrderBreakdownModal onClose={() => setShowWorkOrders(false)} />}

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
