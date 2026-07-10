import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from './api';
import { register as registerTenant } from './auth/authApi';
import type { Property, Tenant } from './data/types';
import { Card, EmptyState, Loading, PageHeader, TableScroll } from './components/ui';
import { money } from './format';
import { useT } from './i18n';

export default function PropertyDetail() {
  const t = useT();
  const { id } = useParams<{ id: string }>();
  const propId = Number(id);
  const [property, setProperty] = useState<Property | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [toast, setToast] = useState('');

  const load = () =>
    Promise.all([
      api.get<Property>(`/properties/${propId}`).then((r) => r.data),
      api.get<Tenant[]>(`/properties/${propId}/tenants/`).then((r) => r.data),
    ]).then(([prop, t]) => {
      setProperty(prop);
      setTenants(t);
    });

  useEffect(() => {
    load().catch(() => setTenants([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propId]);

  const removeTenant = async (tenantId: number) => {
    if (!window.confirm(t('property.terminateConfirm'))) return;
    await api.delete(`/tenants/${tenantId}`);
    await load();
  };

  if (!tenants) return <Loading />;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-semibold z-50">
          ✓ {toast}
        </div>
      )}

      <Link to="/properties" className="text-sm text-blue-600 font-semibold hover:underline">
        {t('property.backToProperties')}
      </Link>
      <PageHeader
        title={property?.address ?? `Property #${propId}`}
        subtitle={
          property
            ? t('property.unitsTenants', { units: property.units, tenants: tenants.length })
            : undefined
        }
        actions={
          <div className="flex gap-2">
            <Link
              to="/financials"
              className="bg-white border border-slate-200 text-slate-700 font-semibold px-4 py-2.5 rounded-xl hover:bg-slate-50"
            >
              {t('property.rentRoll')}
            </Link>
            <button
              onClick={() => setShowModal(true)}
              className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
            >
              {t('property.registerTenant')}
            </button>
          </div>
        }
      />

      <Card>
        {tenants.length === 0 ? (
          <EmptyState>{t('property.noTenants')}</EmptyState>
        ) : (
          <TableScroll minWidth="min-w-[560px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">{t('property.colTenant')}</th>
                <th className="px-5 py-3 font-semibold">{t('property.colUnit')}</th>
                <th className="px-5 py-3 font-semibold">{t('property.colRent')}</th>
                <th className="px-5 py-3 font-semibold">{t('property.colLease')}</th>
                <th className="px-5 py-3 font-semibold text-right">{t('common.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((row) => (
                <tr key={row.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">
                    {row.name}
                    <div className="text-xs text-slate-400">{row.email}</div>
                    {row.phone && <div className="text-xs text-slate-400">{row.phone}</div>}
                  </td>
                  <td className="px-5 py-3 text-slate-500">{row.unit_label ?? '—'}</td>
                  <td className="px-5 py-3 font-semibold text-slate-700">{money(row.rent_amount)}</td>
                  <td className="px-5 py-3 text-slate-500">
                    {row.lease_start_date} → {row.lease_end_date}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => removeTenant(row.id)}
                      className="text-slate-400 hover:text-red-600 text-sm font-semibold"
                    >
                      {t('common.remove')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
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
  const t = useT();
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
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
        phone: form.phone || null,
        unit_label: form.unit_label || null,
        rent_amount: parseFloat(form.rent_amount),
        lease_start_date: form.lease_start_date,
        lease_end_date: form.lease_end_date,
      });
      let msg = t('tenantForm.leaseActivated');
      if (createAccount && tempPassword) {
        try {
          await registerTenant(form.email, tempPassword, 'tenant', { phone: form.phone || undefined });
          msg = t('tenantForm.leaseAndAccount');
        } catch {
          msg = t('tenantForm.leaseAccountFailed');
        }
      }
      onDone(msg);
    } catch {
      setError(t('tenantForm.failedRegister'));
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-6 sm:p-8 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-2xl font-bold mb-6 text-slate-900">{t('tenantForm.title')}</h2>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
          <input required placeholder={t('tenantForm.fullName')} className={input} value={form.name} onChange={set('name')} />
          <input required type="email" placeholder={t('tenantForm.emailPlaceholder')} className={input} value={form.email} onChange={set('email')} />
          <input type="tel" placeholder={t('tenantForm.phonePlaceholder')} className={input} value={form.phone} onChange={set('phone')} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input placeholder={t('tenantForm.unitPlaceholder')} className={input} value={form.unit_label} onChange={set('unit_label')} />
            <input required type="number" step="0.01" placeholder={t('tenantForm.rentPlaceholder')} className={input} value={form.rent_amount} onChange={set('rent_amount')} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
              <span className="font-semibold text-slate-700">{t('tenantForm.portalAccess')}</span>
            </label>
            {createAccount && (
              <div className="mt-3">
                <input
                  type="text"
                  required={createAccount}
                  placeholder={t('tenantForm.tempPassword')}
                  className={input}
                  value={tempPassword}
                  onChange={(e) => setTempPassword(e.target.value)}
                />
                <p className="text-xs text-slate-400 mt-1">{t('tenantForm.tempPasswordHint')}</p>
              </div>
            )}
          </div>

          <div className="flex gap-3 mt-6">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50">
              {t('common.cancel')}
            </button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50">
              {saving ? t('common.saving') : t('tenantForm.activate')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
