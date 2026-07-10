import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { createUser, listUsers, type AdminUserRow } from './data/api';
import { useAuthStore } from './authStore';
import { Badge, Card, Loading, PageHeader, TableScroll } from './components/ui';
import { useT, type MessageKey } from './i18n';

// Localized display name for a coarse role slug (falls back to the slug).
const roleLabelKey = (role: string): MessageKey => `role.${role}` as MessageKey;

type StaffRole = 'manager' | 'maintenance';

// Roles assignable when onboarding an employee, mirroring the backend guards.
// Only full admins may mint privileged "manager" peers; a plain staff manager
// is limited to "maintenance" (see STAFF_ASSIGNABLE_ROLES in routers/auth.py).
const ADMIN_ASSIGNABLE: StaffRole[] = ['manager', 'maintenance'];
const MANAGER_ASSIGNABLE: StaffRole[] = ['maintenance'];

/**
 * Employee roster for managers (permission `manage_staff`). Lists the staff the
 * caller may manage and onboards new employees with a generated one-time
 * password. Admins keep the fuller IAM view on the People page.
 */
export default function Employees(): ReactElement {
  const t = useT();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => listUsers().then(setUsers).catch(() => setUsers([]));
  useEffect(() => {
    load();
  }, []);

  if (!users) return <Loading />;

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <PageHeader
        title={t('employees.title')}
        subtitle={t('employees.subtitle')}
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
          >
            {t('employees.addBtn')}
          </button>
        }
      />

      <Card>
        {users.length === 0 ? (
          <div className="p-8 text-center text-slate-400">{t('employees.empty')}</div>
        ) : (
          <TableScroll minWidth="min-w-[560px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-400 border-b border-slate-100">
                  <th className="px-5 py-3 font-semibold">{t('employees.colName')}</th>
                  <th className="px-5 py-3 font-semibold">{t('employees.colEmail')}</th>
                  <th className="px-5 py-3 font-semibold">{t('employees.colRole')}</th>
                  <th className="px-5 py-3 font-semibold">{t('employees.col2fa')}</th>
                  <th className="px-5 py-3 font-semibold">{t('employees.colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-slate-50">
                    <td className="px-5 py-3 font-medium text-slate-800">
                      {u.display_name || '—'}
                      {u.phone && <div className="text-xs text-slate-400">{u.phone}</div>}
                    </td>
                    <td className="px-5 py-3 text-slate-500">{u.email}</td>
                    <td className="px-5 py-3">
                      <Badge value={u.role} label={t(roleLabelKey(u.role))} />
                    </td>
                    <td className="px-5 py-3 text-slate-500">{u.totp_enabled ? '✅' : '—'}</td>
                    <td className="px-5 py-3 text-slate-500">
                      {u.is_active ? t('common.active') : t('common.disabled')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        )}
      </Card>

      {showAdd && <AddEmployeeModal onClose={() => setShowAdd(false)} onCreated={load} />}
    </div>
  );
}

function AddEmployeeModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}): ReactElement {
  const t = useT();
  const isAdmin = useAuthStore((s) => s.hasPermission('admin'));
  const assignableRoles = isAdmin ? ADMIN_ASSIGNABLE : MANAGER_ASSIGNABLE;
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<StaffRole>(assignableRoles[0]);
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await createUser({
        email,
        role,
        display_name: displayName || undefined,
        phone: phone || undefined,
      });
      setOtp(res.generated_otp);
      onCreated();
    } catch {
      setError(t('employees.createError'));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-xl">
        {otp ? (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold text-slate-900">{t('employees.createdTitle')}</h2>
            <p className="text-slate-500 text-sm">{t('employees.otpShareNote')}</p>
            <div className="font-mono text-lg bg-slate-100 rounded-xl py-3">{otp}</div>
            <button
              onClick={onClose}
              className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700"
            >
              {t('common.done')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">{t('employees.addTitle')}</h2>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
            <input
              type="email"
              required
              placeholder={t('employees.emailPlaceholder')}
              className={inputCls}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder={t('employees.namePlaceholder')}
              className={inputCls}
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <input
              type="tel"
              placeholder={t('employees.phonePlaceholder')}
              className={inputCls}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
            <label className="block text-sm font-semibold text-slate-600">{t('employees.roleLabel')}</label>
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 capitalize"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {t(roleLabelKey(r))}
                </option>
              ))}
            </select>
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? t('common.creating') : t('common.create')}
              </button>
              <button type="button" onClick={onClose} className="px-4 text-slate-500 hover:text-slate-700">
                {t('common.cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
