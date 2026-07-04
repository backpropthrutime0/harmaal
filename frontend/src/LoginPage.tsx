import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from './authStore';
import { login, verify2fa, errorMessage, type LoginResult } from './auth/authApi';

interface LoginPageProps {
  /** Tenant entry point: no staff portal tabs, offers registration. */
  tenant?: boolean;
}

export default function LoginPage({ tenant = false }: LoginPageProps) {
  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [portal, setPortal] = useState<'admin' | 'management' | 'maintenance'>('management');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const setSession = useAuthStore((s) => s.setSession);

  const finish = (result: LoginResult) => {
    if (!result.access_token || !result.user) {
      setError('Unexpected response from server.');
      return;
    }
    setSession(result.access_token, result.user);
    // Route by the account's actual role (authoritative), not the selected tab.
    if (result.must_change_password) {
      navigate('/change-password');
    } else if (result.user.role === 'tenant') {
      navigate('/portal');
    } else {
      // admin / manager / maintenance all land on the role-dispatched dashboard
      navigate('/dashboard');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.status === 'mfa_required' && result.mfa_token) {
        setMfaToken(result.mfa_token);
        setStep('mfa');
      } else {
        finish(result);
      }
    } catch (err) {
      setError(errorMessage(err, 'Invalid credentials. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      finish(await verify2fa(mfaToken, code));
    } catch (err) {
      setError(errorMessage(err, 'Invalid or expired code.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">
            {step === 'mfa'
              ? 'Two-Factor Verification'
              : tenant
                ? 'Tenant Sign In'
                : 'Management'}
          </h1>
          <p className="text-slate-500">
            {step === 'mfa'
              ? 'Enter the 6-digit code from your authenticator app.'
              : tenant
                ? 'Sign in to your resident portal.'
                : 'Sign in to your Harmaal workspace.'}
          </p>
        </div>

        {step === 'credentials' && !tenant && (
          <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
            {([
              ['admin', 'Admin'],
              ['management', 'Management'],
              ['maintenance', 'Maintenance'],
            ] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPortal(key)}
                className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 ${
                  portal === key ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">{error}</div>
        )}

        {step === 'credentials' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <input
                type="email"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@harmaal.com"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
              <input
                type="password"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md disabled:opacity-60"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Authentication Code</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center text-2xl tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md disabled:opacity-60"
            >
              {loading ? 'Verifying…' : 'Verify'}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setCode('');
                setError('');
              }}
              className="w-full text-slate-500 text-sm hover:text-slate-700"
            >
              ← Back to login
            </button>
          </form>
        )}

        {step === 'credentials' && tenant && (
          <div className="mt-8 text-center text-sm text-slate-500">
            New here?{' '}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
              Become a tenant
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
