import { useState } from 'react';
import type { ReactElement } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../authStore';
import { errorMessage, login, verify2fa, type LoginResult } from '../auth/authApi';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useT } from '../i18n';
import { FEED_PERMISSION } from './FeedShell';

/**
 * Sign-in for the Hormaal Animal Feed console.
 *
 * The product has no self-service tier, so there is exactly one door: an
 * administrator's credentials (plus TOTP when the account has it enabled).
 * Authorization is still the server's call — this page only checks
 * `manage_feed` afterwards so a signed-in-but-unentitled user gets an honest
 * message here instead of a 403 on the next screen.
 */
export default function FeedLogin(): ReactElement {
  const t = useT();
  const navigate = useNavigate();
  const { setSession, clearSession, isAuthenticated, hasPermission } = useAuthStore();

  const [step, setStep] = useState<'credentials' | 'mfa'>('credentials');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Already signed in with feed access — skip the form entirely.
  if (isAuthenticated() && hasPermission(FEED_PERMISSION)) {
    return <Navigate to="/feed" replace />;
  }

  const finish = (result: LoginResult) => {
    if (!result.access_token || !result.user) {
      setError(t('login.unexpected'));
      return;
    }
    if (result.must_change_password) {
      // The session has to exist for the change-password screen to work.
      setSession(result.access_token, result.user);
      navigate('/change-password', { state: { from: '/feed' } });
      return;
    }
    if (!result.user.permissions?.includes(FEED_PERMISSION)) {
      // Don't leave a half-useful session lying around for a console the user
      // cannot open; make them sign in as someone who can.
      clearSession();
      setError(t('feed.login.noAccess'));
      setStep('credentials');
      setPassword('');
      setCode('');
      return;
    }
    setSession(result.access_token, result.user);
    navigate('/feed');
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
      setError(errorMessage(err, t('login.invalidCreds')));
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
      setError(errorMessage(err, t('login.invalidCode')));
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-4 py-3 transition focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#6aa84f]';

  return (
    <div className="flex min-h-screen-safe items-center justify-center bg-[#f7f8f4] px-6">
      <Link
        to="/"
        className="absolute left-4 top-4 flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-[#3f7d3f] sm:left-8 sm:top-6"
      >
        <span className="text-base leading-none" aria-hidden="true">
          🏠
        </span>
        <span>{t('feed.login.backToGroup')}</span>
      </Link>
      <div className="absolute right-4 top-4 sm:right-8 sm:top-6">
        <LanguageSwitcher />
      </div>

      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <div className="mb-3 text-4xl" aria-hidden="true">
            🐐
          </div>
          <div className="text-[10px] font-bold uppercase tracking-widest text-[#6aa84f]">
            {t('feed.brand')}
          </div>
          <h1 className="mb-2 mt-2 text-3xl font-bold text-slate-900">
            {step === 'mfa' ? t('login.mfaTitle') : t('feed.login.title')}
          </h1>
          <p className="text-slate-500">
            {step === 'mfa' ? t('login.mfaSubtitle') : t('feed.login.subtitle')}
          </p>
        </div>

        {error && (
          <div
            role="alert"
            className="mb-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600"
          >
            {error}
          </div>
        )}

        {step === 'credentials' ? (
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label htmlFor="feed-email" className="mb-2 block text-sm font-semibold text-slate-700">
                {t('login.emailLabel')}
              </label>
              <input
                id="feed-email"
                type="email"
                required
                autoComplete="username"
                className={inputClass}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@harmaal.local"
              />
            </div>
            <div>
              <label
                htmlFor="feed-password"
                className="mb-2 block text-sm font-semibold text-slate-700"
              >
                {t('login.passwordLabel')}
              </label>
              <input
                id="feed-password"
                type="password"
                required
                autoComplete="current-password"
                className={inputClass}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#3f7d3f] py-3 font-bold text-white shadow-md transition hover:bg-[#356b35] disabled:opacity-60"
            >
              {loading ? t('login.signingIn') : t('login.signIn')}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-6">
            <div>
              <label htmlFor="feed-code" className="mb-2 block text-sm font-semibold text-slate-700">
                {t('login.codeLabel')}
              </label>
              <input
                id="feed-code"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                required
                autoFocus
                autoComplete="one-time-code"
                className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-[#3f7d3f] py-3 font-bold text-white shadow-md transition hover:bg-[#356b35] disabled:opacity-60"
            >
              {loading ? t('login.verifying') : t('login.verify')}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep('credentials');
                setCode('');
                setError('');
              }}
              className="w-full text-sm text-slate-500 hover:text-slate-700"
            >
              {t('login.backToLogin')}
            </button>
          </form>
        )}

        <p className="mt-8 text-center text-xs text-slate-400">{t('feed.login.adminOnly')}</p>
      </div>
    </div>
  );
}
