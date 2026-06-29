import { useEffect, useState } from 'react';
import { createUser, listUsers, type AdminUserRow } from './data/api';
import { Badge, Card, Loading, PageHeader } from './components/ui';

const ROLES = ['manager', 'maintenance', 'admin', 'tenant'];

export default function People() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = () => listUsers().then(setUsers).catch(() => setUsers([]));
  useEffect(() => {
    load();
  }, []);

  if (!users) return <Loading />;

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <PageHeader
        title="People"
        subtitle="Staff and tenant accounts."
        actions={
          <button
            onClick={() => setShowAdd(true)}
            className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
          >
            + Add User
          </button>
        }
      />

      <Card>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Role</th>
              <th className="px-5 py-3 font-semibold">2FA</th>
              <th className="px-5 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{u.display_name || '—'}</td>
                <td className="px-5 py-3 text-slate-500">{u.email}</td>
                <td className="px-5 py-3">
                  <Badge value={u.role} />
                </td>
                <td className="px-5 py-3 text-slate-500">{u.totp_enabled ? '✅' : '—'}</td>
                <td className="px-5 py-3 text-slate-500">{u.is_active ? 'Active' : 'Disabled'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={load} />}
    </div>
  );
}

function AddUserModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('manager');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await createUser({ email, role, display_name: displayName || undefined });
      setOtp(res.generated_otp);
      onCreated();
    } catch {
      setError('Could not create user (email may already exist).');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-xl">
        {otp ? (
          <div className="space-y-4 text-center">
            <h2 className="text-xl font-bold text-slate-900">User created</h2>
            <p className="text-slate-500 text-sm">Share this one-time password. They must change it on first login.</p>
            <div className="font-mono text-lg bg-slate-100 rounded-xl py-3">{otp}</div>
            <button onClick={onClose} className="w-full bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <h2 className="text-xl font-bold text-slate-900">Add User</h2>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
            <input
              type="email"
              required
              placeholder="email@harmaal.com"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input
              placeholder="Display name (optional)"
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
            />
            <select
              className="w-full px-4 py-2.5 rounded-xl border border-slate-200 capitalize"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
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
        )}
      </div>
    </div>
  );
}
