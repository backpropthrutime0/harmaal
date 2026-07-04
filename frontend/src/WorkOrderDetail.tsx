import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  addWorkOrderMessage,
  getMaintenanceStaff,
  getWorkOrder,
  updateWorkOrder,
  type MaintenanceStaff,
} from './data/api';
import type { WorkOrder } from './data/types';
import { WO_PRIORITIES, WO_STATUSES } from './data/types';
import { useAuthStore } from './authStore';
import { Badge, Card, Loading, money } from './components/ui';

function when(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function WorkOrderDetail() {
  const { id } = useParams();
  const woId = Number(id);
  const { user, hasPermission } = useAuthStore();
  const role = user?.role;
  const canManage = (role === 'admin' || role === 'manager') && hasPermission('manage_maintenance');
  const canUpdate = canManage || role === 'maintenance';

  const [wo, setWo] = useState<WorkOrder | null>(null);
  const [staff, setStaff] = useState<MaintenanceStaff[]>([]);
  const [message, setMessage] = useState('');
  const [costInput, setCostInput] = useState('');
  const [sending, setSending] = useState(false);

  const load = () => getWorkOrder(woId).then(setWo).catch(() => setWo(null));
  useEffect(() => {
    load();
    if (canManage) getMaintenanceStaff().then(setStaff).catch(() => setStaff([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId]);

  const patch = async (body: Parameters<typeof updateWorkOrder>[1]) => {
    await updateWorkOrder(woId, body);
    await load();
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      await addWorkOrderMessage(woId, message.trim());
      setMessage('');
      await load();
    } finally {
      setSending(false);
    }
  };

  if (!wo) return <Loading />;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <Link to="/work-orders" className="text-sm text-blue-600 font-semibold hover:underline">
        ← Work orders
      </Link>

      <div className="flex items-start justify-between mt-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{wo.title}</h1>
          <p className="text-slate-500 mt-1">
            {wo.property_address} · Unit {wo.unit_label} · {wo.tenant_name ?? 'No tenant'}
          </p>
        </div>
        <div className="flex gap-2">
          <Badge value={wo.category} />
          <Badge value={wo.priority} />
          <Badge value={wo.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Details + thread */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <h2 className="font-bold text-slate-800 mb-2">Details</h2>
            <p className="text-slate-600">{wo.description}</p>
            <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
              <div>
                <div className="text-slate-400">Assigned to</div>
                <div className="font-medium text-slate-700">{wo.assignee_name ?? 'Unassigned'}</div>
              </div>
              <div>
                <div className="text-slate-400">Cost</div>
                <div className="font-medium text-slate-700">{wo.cost != null ? money(wo.cost) : '—'}</div>
              </div>
              <div>
                <div className="text-slate-400">Opened</div>
                <div className="font-medium text-slate-700">{when(wo.created_at)}</div>
              </div>
              <div>
                <div className="text-slate-400">Completed</div>
                <div className="font-medium text-slate-700">{wo.completed_at ? when(wo.completed_at) : '—'}</div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="font-bold text-slate-800 mb-4">Communication</h2>
            <div className="space-y-4 mb-4">
              {wo.messages.map((m) => (
                <div key={m.id} className="flex gap-3">
                  <div className="w-9 h-9 rounded-full bg-harmaal-blue/10 text-harmaal-blue flex items-center justify-center font-bold text-sm shrink-0">
                    {m.author_name.charAt(0)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-800 text-sm">{m.author_name}</span>
                      <Badge value={m.author_role} />
                      <span className="text-xs text-slate-400">{when(m.created_at)}</span>
                    </div>
                    <p className="text-slate-600 text-sm mt-0.5">{m.body}</p>
                  </div>
                </div>
              ))}
              {wo.messages.length === 0 && <p className="text-slate-400 text-sm">No messages yet.</p>}
            </div>
            <form onSubmit={sendMessage} className="flex gap-2">
              <input
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
                placeholder="Write a message…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                type="submit"
                disabled={sending}
                className="bg-blue-600 text-white font-semibold px-5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                Send
              </button>
            </form>
          </Card>
        </div>

        {/* Actions */}
        <div className="space-y-6">
          {canUpdate && (
            <Card className="p-6 space-y-4">
              <h2 className="font-bold text-slate-800">Update</h2>

              <div>
                <label className="text-xs font-semibold text-slate-500">Status</label>
                <select
                  className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 capitalize"
                  value={wo.status}
                  onChange={(e) => patch({ status: e.target.value })}
                >
                  {WO_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {canManage && (
                <>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Assign to</label>
                    <select
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200"
                      value={wo.assigned_to ?? ''}
                      onChange={(e) => patch({ assigned_to: Number(e.target.value) })}
                    >
                      <option value="">Unassigned</option>
                      {staff.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Priority</label>
                    <select
                      className="w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 capitalize"
                      value={wo.priority}
                      onChange={(e) => patch({ priority: e.target.value })}
                    >
                      {WO_PRIORITIES.map((p) => (
                        <option key={p} value={p}>
                          {p}
                        </option>
                      ))}
                    </select>
                  </div>
                </>
              )}

              <div>
                <label className="text-xs font-semibold text-slate-500">Record cost ($)</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200"
                    placeholder={wo.cost != null ? String(wo.cost) : '0'}
                    value={costInput}
                    onChange={(e) => setCostInput(e.target.value)}
                  />
                  <button
                    onClick={() => costInput && patch({ cost: Number(costInput) }).then(() => setCostInput(''))}
                    className="bg-slate-800 text-white text-sm font-semibold px-3 rounded-xl hover:bg-slate-900"
                  >
                    Save
                  </button>
                </div>
                <label className="mt-2 flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={wo.paid_in_cash}
                    onChange={(e) => patch({ paid_in_cash: e.target.checked })}
                    className="w-4 h-4 rounded accent-harmaal-blue"
                  />
                  Paid from cash drawer
                  <span className="text-xs text-slate-400">(counts against cash on hand)</span>
                </label>
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
