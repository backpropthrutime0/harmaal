import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyCharges, getMyLease } from './data/api';
import type { Charge, Tenant } from './data/types';
import { Card, Loading, PageHeader, StatCard } from './components/ui';
import { money } from './format';

export default function TenantPortal() {
  const [lease, setLease] = useState<Tenant | null>(null);
  const [charges, setCharges] = useState<Charge[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getMyLease(), getMyCharges()])
      .then(([l, c]) => {
        setLease(l);
        setCharges(c);
      })
      .catch(() => setError('Could not load your lease. Please contact management.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading label="Loading your portal…" />;
  if (error || !lease) return <div className="p-8 text-center text-slate-500">{error || 'No lease on file.'}</div>;

  const balance = charges.filter((c) => c.status !== 'paid').reduce((s, c) => s + c.amount, 0);
  const nextDue = charges.filter((c) => c.status !== 'paid').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];

  // Backend derives "overdue" for unpaid charges past their due date.
  const overdue = charges.filter((c) => c.status === 'overdue').sort((a, b) => a.due_date.localeCompare(b.due_date));
  const overdueTotal = overdue.reduce((s, c) => s + c.amount, 0);

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto">
      <PageHeader title={`Welcome back, ${lease.name}`} subtitle={`Unit ${lease.unit_label ?? ''}`} />

      {overdue.length > 0 && (
        <div
          role="alert"
          className="mb-8 rounded-2xl border-2 border-red-300 bg-red-50 p-6 shadow-sm"
        >
          <div className="flex items-start gap-4">
            <div className="text-3xl leading-none" aria-hidden="true">
              ⚠️
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-bold text-red-800">Your rent is overdue</h2>
              <p className="mt-1 text-sm text-red-700">
                You have {overdue.length} overdue {overdue.length === 1 ? 'charge' : 'charges'} totaling{' '}
                <span className="font-bold">{money(overdueTotal)}</span>. The oldest was due on{' '}
                <span className="font-semibold">{overdue[0].due_date}</span>. Please pay as soon as possible
                to avoid late fees, or contact your property manager.
              </p>
              <Link
                to="/portal/payments"
                className="mt-4 inline-block rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-red-700"
              >
                View balance &amp; pay →
              </Link>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <StatCard label="Monthly Rent" value={money(lease.rent_amount)} />
        <StatCard
          label="Balance Due"
          value={money(balance)}
          tone={balance > 0 ? 'bad' : 'good'}
          sub={nextDue ? `Next due ${nextDue.due_date}` : 'All paid'}
        />
        <StatCard label="Lease Ends" value={lease.lease_end_date} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link to="/portal/payments">
          <Card className="p-6 hover:shadow-md transition">
            <div className="text-2xl mb-2">💳</div>
            <h2 className="font-bold text-slate-800">Payments</h2>
            <p className="text-slate-500 text-sm">View your rent ledger and payment history.</p>
          </Card>
        </Link>
        <Link to="/portal/maintenance">
          <Card className="p-6 hover:shadow-md transition">
            <div className="text-2xl mb-2">🔧</div>
            <h2 className="font-bold text-slate-800">Maintenance</h2>
            <p className="text-slate-500 text-sm">Submit a request and track its progress.</p>
          </Card>
        </Link>
      </div>
    </div>
  );
}
