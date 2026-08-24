import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { changePassword, errorMessage } from './auth/authApi';

/**
 * Sign-in page to return to once the password has been rotated.
 *
 * Hormaal Group runs more than one product out of this bundle and this screen is
 * shared by all of them. A feed admin forced through here by an admin-issued
 * one-time password must land back on `/feed/login` — otherwise the one flow
 * that leaves `/feed` drops them into a different company's sign-in.
 */
function returnLoginPath(from: string | undefined): string {
  return from?.startsWith('/feed') ? '/feed/login' : '/login';
}

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const clearSession = useAuthStore((s) => s.clearSession);
  // The guard that redirected here records the attempted path in router state.
  const from = (location.state as { from?: string } | null)?.from;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== confirm) {
      setError('New passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      // Token still carries the old must_change_password flag — re-authenticate.
      clearSession();
      navigate(returnLoginPath(from));
    } catch (err) {
      setError(errorMessage(err, 'Could not change password.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Change Password</h1>
          <p className="text-slate-500">Choose a strong new password to continue.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Current Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">New Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <p className="mt-2 text-xs text-slate-400">
              At least 12 characters with upper, lower, number, and a symbol.
            </p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Confirm New Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md disabled:opacity-60"
          >
            {loading ? 'Updating…' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}
