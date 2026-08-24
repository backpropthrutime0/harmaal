import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  listPermissions,
  listRoles,
  setRolePermissions,
  type PermissionRow,
  type RoleRow,
} from './data/api';
import { Card, EmptyState, Loading, TableScroll } from './components/ui';
import { errorMessage } from './auth/authApi';

/**
 * Role → permission matrix. Ticking a box grants an authorization to every user
 * holding that role; unticking revokes it. This is how `view_business`
 * (analytics + financial data) is handed out, since it ships admin-only.
 */
export function RolesPermissions(): ReactElement {
  const [roles, setRoles] = useState<RoleRow[] | null>(null);
  const [permissions, setPermissions] = useState<PermissionRow[]>([]);
  /** Pending edits keyed by role id — only roles the admin actually touched. */
  const [draft, setDraft] = useState<Record<number, string[]>>({});
  const [saving, setSaving] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<number | null>(null);

  const load = () =>
    Promise.all([listRoles(), listPermissions()])
      .then(([r, p]) => {
        setRoles(r);
        setPermissions(p);
        setDraft({});
      })
      .catch((err) => {
        setError(errorMessage(err));
        setRoles([]);
      });

  useEffect(() => {
    void load();
  }, []);

  const granted = (role: RoleRow): string[] => draft[role.id] ?? role.permissions;

  const toggle = (role: RoleRow, perm: string) => {
    const current = granted(role);
    const next = current.includes(perm) ? current.filter((p) => p !== perm) : [...current, perm];
    setDraft((d) => ({ ...d, [role.id]: next }));
    setSaved(null);
  };

  const isDirty = (role: RoleRow) => {
    const next = draft[role.id];
    if (!next) return false;
    return [...next].sort().join() !== [...role.permissions].sort().join();
  };

  const save = async (role: RoleRow) => {
    setSaving(role.id);
    setError('');
    try {
      const updated = await setRolePermissions(role.id, granted(role));
      setRoles((rs) => (rs ?? []).map((r) => (r.id === updated.id ? updated : r)));
      setDraft((d) => {
        const next = { ...d };
        delete next[role.id];
        return next;
      });
      setSaved(role.id);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(null);
    }
  };

  const reset = (role: RoleRow) => {
    setDraft((d) => {
      const next = { ...d };
      delete next[role.id];
      return next;
    });
    setError('');
  };

  const dirtyRoles = useMemo(
    () => (roles ?? []).filter((r) => isDirty(r)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roles, draft],
  );

  /** Save every pending role. The per-row buttons live in a column that can be
   *  scrolled off on narrow screens, so this bar is the reachable path. */
  const saveAll = async () => {
    for (const role of dirtyRoles) {
      await save(role);
    }
  };

  if (!roles) return <Loading />;
  if (roles.length === 0) return <EmptyState>No roles configured.</EmptyState>;

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-50 border border-amber-100 p-4 text-sm text-amber-800">
        <span className="font-semibold">Changes apply to every user with the role.</span> Because
        permissions are carried in the sign-in token, a grant or revocation takes effect the next
        time the affected user signs in.
      </div>

      {error && <div className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <Card>
        <TableScroll minWidth="min-w-[720px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-slate-400">
                <th className="px-5 py-3 font-semibold">Role</th>
                {permissions.map((p) => (
                  <th key={p.id} className="px-3 py-3 text-center font-semibold" title={p.description ?? ''}>
                    {p.name}
                  </th>
                ))}
                <th className="px-5 py-3 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const dirty = isDirty(role);
                return (
                  <tr key={role.id} className="border-b border-slate-50">
                    <td className="px-5 py-3">
                      <div className="font-medium capitalize text-slate-800">{role.name}</div>
                      <div className="text-xs text-slate-400">
                        {role.user_count} {role.user_count === 1 ? 'user' : 'users'}
                      </div>
                    </td>
                    {permissions.map((p) => {
                      // The admin role must keep full IAM or nobody could restore access.
                      const locked = role.name === 'admin' && p.name === 'admin';
                      return (
                        <td key={p.id} className="px-3 py-3 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 disabled:opacity-40"
                            checked={granted(role).includes(p.name)}
                            disabled={locked || saving === role.id}
                            onChange={() => toggle(role, p.name)}
                            aria-label={`${p.name} for ${role.name}`}
                            title={locked ? 'The admin role must keep full IAM access' : p.description ?? ''}
                          />
                        </td>
                      );
                    })}
                    <td className="px-5 py-3 text-right whitespace-nowrap">
                      {dirty ? (
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => reset(role)}
                            className="text-sm text-slate-500 hover:text-slate-700"
                          >
                            Reset
                          </button>
                          <button
                            onClick={() => void save(role)}
                            disabled={saving === role.id}
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                          >
                            {saving === role.id ? 'Saving…' : 'Save'}
                          </button>
                        </div>
                      ) : saved === role.id ? (
                        <span className="text-sm font-semibold text-emerald-600">Saved</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </TableScroll>
      </Card>

      {dirtyRoles.length > 0 && (
        <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            {dirtyRoles.length} {dirtyRoles.length === 1 ? 'role has' : 'roles have'} unsaved
            changes.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => dirtyRoles.forEach(reset)}
              disabled={saving !== null}
              className="px-3 py-1.5 text-sm font-semibold text-slate-500 hover:text-slate-700 disabled:opacity-50"
            >
              Reset all
            </button>
            <button
              onClick={() => void saveAll()}
              disabled={saving !== null}
              className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving !== null ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
