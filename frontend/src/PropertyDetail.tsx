import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from './api';
import { register as registerTenant } from './auth/authApi';
import type { Property, Tenant } from './data/types';
import { Card, EmptyState, Loading, PageHeader, money } from './components/ui';

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const propId = Number(id);
  const [property, setProperty] = useState<Property | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState('');

  const load = async () => {
    const [prop, t] = await Promise.all([
      api.get<Property>(`/properties/${propId}`).then((r) => r.data),
      api.get<Tenant[]>(`/properties/${propId}/tenants/`).then((r) => r.data),
    ]);
    setProperty(prop);
    setTenants(t);
  };

  useEffect(() => {
    load().catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propId]);

  const removeTenant = async (tenantId: number) => {
    if (!window.confirm('Terminate this lease?')) return;
    await api.delete(`/tenants/${tenantId}`);
    await load();
  };

  if (!tenants) return <Loading />;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-semibold z-50">
          ✓ {toast}
        </div>
      )}

      <Link to="/properties" className="text-sm text-blue-600 font-semibold hover:underline">
        ← Properties
      </Link>
      <PageHeader
        title={property?.address ?? `Property #${propId}`}
        subtitle={property ? `${property.units} units · ${tenants.length} tenants` : undefined}
        actions={
          <div className="flex gap-2">
            <Link
              to="/financials"
              className="bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50"
            >
              Rent Roll
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
            >
              + Register Tenant
            </button>
          </div>
        }
      />

      <Card>
        {tenants.length === 0 ? (
          <EmptyState>No tenants registered for this property yet.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Tenant</th>
                <th className="px-5 py-3 font-semibold">Unit</th>
                <th className="px-5 py-3 font-semibold">Monthly Rent</th>
                <th className="px-5 py-3 font-semibold">Lease Term</th>
                <th className="px-5 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <tr key={t.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {t.name}
                    <div className="text-xs text-slate-400">{t.email}</div>
                  </td>
                  <td className="px-5 py-3 text-slate-500">{t.unit_label ?? '—'}</td>
                  <td className="px-5 py-3 font-semibold text-slate-700">{money(t.rent_amount)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {t.lease_start_date} → {t.lease_end_date}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => removeTenant(t.id)}
                      className="text-slate-400 hover:text-red-600 text-sm font-semibold"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showModal && (
        <AddTenantModal
          propertyId={propId}
          onClose={() => setShowModal(false)}
          onDone={(msg) => {
            setShowModal(false);
            setToast(msg);
            load();
            setTimeout(() => setToast(''), 4000);
          }}
        />
      )}
    </div>
  );
}

function AddTenantModal({
  propertyId,
  onClose,
  onDone,
}: {
  propertyId: number;
  onClose: () => void;
  onDone: (msg: string) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    email: '',
    unit_label: '',
    rent_amount: '',
    lease_start_date: '',
    lease_end_date: '',
  });
  const [createAccount, setCreateAccount] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/properties/${propertyId}/tenants/`, {
        name: form.name,
        email: form.email,
        unit_label: form.unit_label || null,
        rent_amount: parseFloat(form.rent_amount),
        lease_start_date: form.lease_start_date,
        lease_end_date: form.lease_end_date,
      });
      let msg = 'Lease activated.';
      if (createAccount && tempPassword) {
        try {
          await registerTenant(form.email, tempPassword, 'tenant');
          msg = 'Lease activated and portal account created.';
        } catch {
          msg = 'Lease created, but portal account failed (password too weak or already exists).';
        }
      }
      onDone(msg);
    } catch {
      setError('Failed to register tenant.');
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-slate-900">Initialize Lease</h2>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
          <input required placeholder="Full name" className={input} value={form.name} onChange={set('name')} />
          <input required type="email" placeholder="tenant@example.com" className={input} value={form.email} onChange={set('email')} />
          <div className="grid grid-cols-2 gap-4">
            <input placeholder="Unit (e.g. A-101)" className={input} value={form.unit_label} onChange={set('unit_label')} />
            <input required type="number" step="0.01" placeholder="Monthly rent" className={input} value={form.rent_amount} onChange={set('rent_amount')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <input required type="date" className={input} value={form.lease_start_date} onChange={set('lease_start_date')} />
            <input required type="date" className={input} value={form.lease_end_date} onChange={set('lease_end_date')} />
          </div>

          <div className="pt-4 mt-2 border-t border-slate-100">
            <label className="flex items-center space-x-3 cursor-pointer">
              <input
                type="checkbox"
                checked={createAccount}
                onChange={(e) => setCreateAccount(e.target.checked)}
                className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
              />
              <span className="font-semibold text-slate-700">Create tenant portal access</span>
            </label>
            {createAccount && (
              <div className="mt-3">
                <input
                  type="text"
                  required={createAccount}
                  placeholder="Temporary password (strong)"
                  className={input}
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">≥12 chars, upper/lower/number/symbol.</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Activate Lease'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
