import { useEffect, useState } from 'react';
import { createUser, listUsers, listRoles, setUserRoles, type AdminUserRow, type RoleRow } from './data/api';
import { Badge, Card, Loading, Modal, PageHeader, TableScroll } from './components/ui';
import { RolesPermissions } from './RolesPermissions';
import { errorMessage } from './auth/authApi';

const ROLES = ['manager', 'maintenance', 'admin', 'tenant'];

type Tab = 'users' | 'roles';

export default function People() {
  const [tab, setTab] = useState<Tab>('users');

  return (
    <div className="p-4 sm:p-8 max-w-6xl mx-auto">
      <PageHeader
        title="People & Access"
        subtitle="Staff and tenant accounts, and the authorizations each role carries."
      />

      <div className="mb-6 flex gap-2 border-b border-slate-200">
        {(
          [
            ['users', 'Users'],
            ['roles', 'Roles & Permissions'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
              tab === key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : <RolesPermissions />}
    </div>
  );
}

function UsersTab() {
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [roles, setRoles] = useState<RoleRow[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const load = () => listUsers().then(setUsers).catch(() => setUsers([]));
  useEffect(() => {
    load();
    listRoles().then(setRoles).catch(() => setRoles([]));
  }, []);

  if (!users) return <Loading />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={() => setShowAdd(true)}
          className="bg-blue-600 text-white font-bold px-5 py-2.5 rounded-xl hover:bg-blue-700 transition"
        >
          + Add User
        </button>
      </div>

      <Card>
        <TableScroll minWidth="min-w-[560px]">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400 border-b border-slate-100">
              <th className="px-5 py-3 font-semibold">Name</th>
              <th className="px-5 py-3 font-semibold">Email</th>
              <th className="px-5 py-3 font-semibold">Roles</th>
              <th className="px-5 py-3 font-semibold">2FA</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-slate-50">
                <td className="px-5 py-3 font-medium text-slate-800">{u.display_name || '—'}</td>
                <td className="px-5 py-3 text-slate-500">{u.email}</td>
                <td className="px-5 py-3">
                  <div className="flex flex-wrap gap-1">
                    {(u.roles?.length ? u.roles.map((r) => r.name) : [u.role]).map((name) => (
                      <Badge key={name} value={name} />
                    ))}
                  </div>
                </td>
                <td className="px-5 py-3 text-slate-500">{u.totp_enabled ? '✅' : '—'}</td>
                <td className="px-5 py-3 text-slate-500">{u.is_active ? 'Active' : 'Disabled'}</td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setEditing(u)}
                    className="text-sm font-semibold text-blue-600 hover:underline"
                  >
                    Edit roles
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </TableScroll>
      </Card>

      {showAdd && <AddUserModal onClose={() => setShowAdd(false)} onCreated={load} />}
      {editing && (
        <EditRolesModal
          user={editing}
          roles={roles}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Assign roles to one user. Roles are the unit of authorization, so this is how
 * an individual gains or loses access — the coarse role follows the most
 * privileged assignment automatically.
 */
function EditRolesModal({
  user,
  roles,
  onClose,
  onSaved,
}: {
  user: AdminUserRow;
  roles: RoleRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(
    user.roles?.length ? user.roles.map((r) => r.name) : [user.role],
  );
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (name: string) =>
    setSelected((cur) => (cur.includes(name) ? cur.filter((r) => r !== name) : [...cur, name]));

  // Preview the effective authorizations so the admin sees what they're granting.
  const effective = Array.from(
    new Set(roles.filter((r) => selected.includes(r.name)).flatMap((r) => r.permissions)),
  ).sort();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await setUserRoles(user.id, selected);
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit roles" subtitle={user.email}>
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</div>}

        <div className="space-y-2">
          {roles.map((r) => (
            <label
              key={r.id}
              className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 p-3 hover:bg-slate-50"
            >
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                checked={selected.includes(r.name)}
                onChange={() => toggle(r.name)}
              />
              <span className="min-w-0">
                <span className="block font-medium capitalize text-slate-800">{r.name}</span>
                <span className="block text-xs text-slate-400">
                  {r.permissions.length ? r.permissions.join(', ') : 'No permissions'}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <span className="font-semibold text-slate-700">Effective access: </span>
          <span className="text-slate-500">{effective.length ? effective.join(', ') : 'none'}</span>
        </div>

        <p className="text-xs text-slate-400">
          Takes effect the next time this user signs in.
        </p>

        <div className="flex gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="flex-1 rounded-xl bg-blue-600 py-2.5 font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save roles'}
          </button>
          <button type="button" onClick={onClose} className="px-4 text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
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
