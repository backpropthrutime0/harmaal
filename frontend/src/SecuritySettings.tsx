import { useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useAuthStore } from './authStore';
import {
  setupTotp,
  confirmTotp,
  disableTotp,
  getMe,
  errorMessage,
} from './auth/authApi';

export default function SecuritySettings() {
  const { token, user, setSession } = useAuthStore();
  const [mode, setMode] = useState<'idle' | 'enrolling' | 'disabling'>('idle');
  const [secret, setSecret] = useState('');
  const [qrUri, setQrUri] = useState('');
  const [code, setCode] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const refreshUser = async () => {
    if (!token) return;
    const me = await getMe();
    setSession(token, me);
  };

  const startEnroll = async () => {
    setError('');
    setInfo('');
    setLoading(true);
    try {
      const res = await setupTotp();
      setSecret(res.secret);
      setQrUri(res.qr_uri);
      setMode('enrolling');
    } catch (err) {
      setError(errorMessage(err, 'Could not start 2FA setup.'));
    } finally {
      setLoading(false);
    }
  };

  const confirmEnroll = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await confirmTotp(code);
      await refreshUser();
      setMode('idle');
      setCode('');
      setInfo('Two-factor authentication is now enabled.');
    } catch (err) {
      setError(errorMessage(err, 'Invalid code. Make sure your app is synced.'));
    } finally {
      setLoading(false);
    }
  };

  const confirmDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await disableTotp(currentPassword);
      await refreshUser();
      setMode('idle');
      setCurrentPassword('');
      setInfo('Two-factor authentication has been disabled.');
    } catch (err) {
      setError(errorMessage(err, 'Could not disable 2FA.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-1">Security Settings</h1>
      <p className="text-slate-500 mb-6">Manage two-factor authentication for your account.</p>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
      {info && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm">{info}</div>}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-slate-800">Authenticator App (TOTP)</h2>
            <p className="text-sm text-slate-500">
              Status:{' '}
              <span className={user?.totp_enabled ? 'text-green-600 font-semibold' : 'text-slate-500'}>
                {user?.totp_enabled ? 'Enabled' : 'Disabled'}
              </span>
            </p>
          </div>
          {mode === 'idle' && !user?.totp_enabled && (
            <button
              onClick={startEnroll}
              disabled={loading}
              className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-60"
            >
              Enable
            </button>
          )}
          {mode === 'idle' && user?.totp_enabled && (
            <button
              onClick={() => setMode('disabling')}
              className="bg-red-50 text-red-600 font-semibold px-4 py-2 rounded-lg hover:bg-red-100 transition"
            >
              Disable
            </button>
          )}
        </div>

        {mode === 'enrolling' && (
          <form onSubmit={confirmEnroll} className="mt-6 border-t border-slate-100 pt-6 space-y-4">
            <p className="text-sm text-slate-600">
              Scan this QR code with Google Authenticator (or any TOTP app), then enter the 6-digit code.
            </p>
            <div className="flex justify-center">
              <QRCodeCanvas value={qrUri} size={180} />
            </div>
            <p className="text-center text-xs text-slate-400 break-all">
              Can&apos;t scan? Key: <span className="font-mono">{secret}</span>
            </p>
            <input
              inputMode="numeric"
              maxLength={6}
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center text-xl tracking-[0.4em] focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl hover:bg-blue-700 transition disabled:opacity-60"
              >
                {loading ? 'Verifying…' : 'Confirm'}
              </button>
              <button
                type="button"
                onClick={() => setMode('idle')}
                className="px-4 text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {mode === 'disabling' && (
          <form onSubmit={confirmDisable} className="mt-6 border-t border-slate-100 pt-6 space-y-4">
            <p className="text-sm text-slate-600">Enter your current password to disable 2FA.</p>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Current password"
            />
            <div className="flex gap-3">
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-red-600 text-white font-bold py-2.5 rounded-xl hover:bg-red-700 transition disabled:opacity-60"
              >
                {loading ? 'Disabling…' : 'Disable 2FA'}
              </button>
              <button
                type="button"
                onClick={() => setMode('idle')}
                className="px-4 text-slate-500 hover:text-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
