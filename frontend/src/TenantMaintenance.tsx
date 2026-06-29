import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { createWorkOrder, getMyLease, listWorkOrders } from './data/api';
import type { Tenant, WorkOrder } from './data/types';
import { WO_CATEGORIES, WO_PRIORITIES } from './data/types';
import { Badge, Card, EmptyState, Loading, PageHeader } from './components/ui';

export default function TenantMaintenance() {
  const [lease, setLease] = useState<Tenant | null>(null);
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [showForm, setShowForm] = useState(false);

  const loadOrders = () => listWorkOrders().then(setOrders).catch(() => setOrders([]));
  useEffect(() => {
    getMyLease().then(setLease).catch(() => setLease(null));
    loadOrders();
  }, []);

  if (!orders) return <Loading />;

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <PageHeader
        title="Maintenance"
        subtitle="Submit and track maintenance requests."
        actions={
          <button
            onClick={() => setShowForm((v) => !v)}
            className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
          >
            {showForm ? 'Close' : '+ New Request'}
          </button>
        }
      />

      {showForm && lease && (
        <RequestForm
          propertyId={lease.property_id}
          onCreated={() => {
            setShowForm(false);
            loadOrders();
          }}
        />
      )}

      <Card>
        {orders.length === 0 ? (
          <EmptyState>No requests yet. Submit one above.</EmptyState>
        ) : (
          <div className="divide-y divide-slate-50">
            {orders.map((o) => (
              <Link
                key={o.id}
                to={`/work-orders/${o.id}`}
                className="flex items-center justify-between px-5 py-4 hover:bg-slate-50"
              >
                <div>
                  <div className="font-semibold text-slate-800">{o.title}</div>
                  <div className="text-xs text-slate-400 capitalize">
                    {o.category} · 💬 {o.messages.length} messages
                  </div>
                </div>
                <div className="flex gap-2">
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

function RequestForm({ propertyId, onCreated }: { propertyId: number; onCreated: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      // Backend re-derives the tenancy/property from the logged-in tenant.
      await createWorkOrder({ property_id: propertyId, title, description, category, priority });
      onCreated();
    } catch {
      setError('Could not submit request.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="p-6 mb-6">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
        <input
          required
          placeholder="What's the issue? (e.g. Leaking faucet)"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          required
          rows={3}
          placeholder="Describe the problem…"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <div className="flex gap-3">
          <select
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 capitalize"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {WO_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 capitalize"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {WO_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? 'Submitting…' : 'Submit request'}
        </button>
      </form>
    </Card>
  );
}
