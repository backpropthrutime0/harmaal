import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMyCharges, getMyLease } from './data/api';
import type { Charge, Tenant } from './data/types';
import { Card, Loading, PageHeader, StatCard, money } from './components/ui';

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

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeader title={`Welcome back, ${lease.name}`} subtitle={`Unit ${lease.unit_label ?? ''}`} />

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
