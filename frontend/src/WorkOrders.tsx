import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createWorkOrder, getProperties, listWorkOrders } from './data/api';
import type { Property, WorkOrder } from './data/types';
import { WO_CATEGORIES, WO_PRIORITIES } from './data/types';
import { useAuthStore } from './authStore';
import { Badge, Card, EmptyState, Loading, PageHeader } from './components/ui';

const STATUS_FILTERS = ['all', 'open', 'assigned', 'in_progress', 'completed', 'cancelled'];

export default function WorkOrders() {
  const navigate = useNavigate();
  const canManage = useAuthStore((s) => s.hasPermission('manage_maintenance') && s.user?.role !== 'maintenance');
  const [orders, setOrders] = useState<WorkOrder[] | null>(null);
  const [filter, setFilter] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const load = () => listWorkOrders().then(setOrders).catch(() => setOrders([]));
  useEffect(() => {
    load();
  }, []);

  const rows = useMemo(
    () => (orders ?? []).filter((o) => (filter === 'all' ? true : o.status === filter)),
    [orders, filter],
  );

  if (!orders) return <Loading />;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader
        title="Work Orders"
        subtitle="Maintenance requests across the portfolio."
        actions={
          canManage ? (
            <button
              onClick={() => setShowCreate(true)}
              className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
            >
              + New Work Order
            </button>
          ) : undefined
        }
      />

      <div className="flex gap-2 mb-4 flex-wrap">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition ${
              filter === f ? 'bg-harmaal-blue text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No work orders.</EmptyState>
        ) : (
          <div className="divide-y divide-slate-50">
            {rows.map((o) => (
              <button
                key={o.id}
                onClick={() => navigate(`/work-orders/${o.id}`)}
                className="w-full text-left flex items-center justify-between px-5 py-4 hover:bg-slate-50"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800 truncate">{o.title}</div>
                  <div className="text-xs text-slate-400">
                    {o.property_address} · {o.unit_label} · {o.category}
                    {o.assignee_name ? ` · ${o.assignee_name}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Badge value={o.priority} />
                  <Badge value={o.status} />
                  <span className="text-xs text-slate-400 ml-2">💬 {o.messages.length}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  );
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState<number | ''>('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('general');
  const [priority, setPriority] = useState('medium');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getProperties().then(setProperties).catch(() => setProperties([]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) {
      setError('Choose a property.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createWorkOrder({ property_id: Number(propertyId), title, description, category, priority });
      onCreated();
      onClose();
    } catch {
      setError('Could not create work order.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <form onSubmit={submit} className="bg-white p-8 rounded-2xl w-full max-w-lg shadow-xl space-y-4">
        <h2 className="text-xl font-bold text-slate-900">New Work Order</h2>
        {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
        <select
          required
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
          value={propertyId}
          onChange={(e) => setPropertyId(e.target.value ? Number(e.target.value) : '')}
        >
          <option value="">Select property…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.address}
            </option>
          ))}
        </select>
        <input
          required
          placeholder="Title (e.g. Leaking faucet)"
          className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          required
          placeholder="Describe the issue…"
          rows={3}
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
        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Creating…' : 'Create'}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
