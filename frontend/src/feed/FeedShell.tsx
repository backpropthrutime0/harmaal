import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, Navigate, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../authStore';
import { LanguageSwitcher } from '../components/LanguageSwitcher';
import { useT, type MessageKey } from '../i18n';

/** The permission that gates the whole Animal Feed console. */
export const FEED_PERMISSION = 'manage_feed';

interface NavItem {
  to: string;
  labelKey: MessageKey;
  icon: string;
  /** Match the path exactly, for the index route. */
  end?: boolean;
}

const FEED_NAV: NavItem[] = [
  { to: '/feed', labelKey: 'feed.nav.dashboard', icon: '📊', end: true },
  { to: '/feed/products', labelKey: 'feed.nav.products', icon: '🧾' },
  { to: '/feed/inventory', labelKey: 'feed.nav.inventory', icon: '📦' },
  { to: '/feed/movements', labelKey: 'feed.nav.movements', icon: '🔁' },
];

/**
 * Route guard for the feed console.
 *
 * Deliberately separate from the property app's `PrivateRoute`: an unauthorized
 * visitor here belongs at `/feed/login`, not the property sign-in page, and a
 * signed-in user who lacks `manage_feed` should be told so rather than silently
 * bounced to a property dashboard they may also not be entitled to.
 */
export function FeedGuard({ children }: { children: ReactElement }): ReactElement {
  const { user, isAuthenticated, hasPermission } = useAuthStore();

  if (!isAuthenticated()) return <Navigate to="/feed/login" replace />;
  // Admin-issued one-time passwords must be rotated before anything else. Carry
  // the origin so the shared change-password screen sends them back here rather
  // than to the property app's sign-in page.
  if (user?.must_change_password) {
    return <Navigate to="/change-password" state={{ from: '/feed' }} replace />;
  }
  if (!hasPermission(FEED_PERMISSION)) return <Navigate to="/feed/login" replace />;
  return children;
}

/**
 * App shell for the feed console — its own sidebar and its own green/amber
 * identity, so it reads as a separate Hormaal Group company rather than a tab
 * inside the property product.
 */
export function FeedShell({ children }: { children: ReactNode }): ReactElement {
  const t = useT();
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleSignOut = () => {
    clearSession();
    navigate('/feed/login');
  };

  const sidebar = (
    <aside className="flex w-64 max-w-[85vw] shrink-0 flex-col bg-[#22401f] pb-safe pl-safe pt-safe text-white shadow-2xl">
      <div className="border-b border-white/10 p-6">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            navigate('/');
          }}
          className="w-full rounded-xl text-left transition hover:opacity-90"
        >
          <div className="text-2xl font-bold tracking-tighter">HORMAAL</div>
          <div className="mt-1 text-[10px] font-bold uppercase tracking-widest text-[#f0b429]">
            {t('feed.brandShort')}
          </div>
        </button>
      </div>

      <nav className="flex-1 space-y-1.5 overflow-y-auto px-4 py-6">
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            navigate('/');
          }}
          className="mb-6 flex w-full items-center gap-3 rounded-2xl bg-white/5 px-4 py-3 font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
        >
          <span className="text-lg leading-none" aria-hidden="true">
            🏠
          </span>
          <span>{t('feed.nav.group')}</span>
        </button>

        {FEED_NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-2xl px-4 py-3 font-semibold transition ${
                isActive
                  ? 'bg-[#6aa84f] text-white shadow-lg'
                  : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`
            }
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {item.icon}
            </span>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-white/10 p-4">
        <div className="truncate px-4 pb-3 text-xs text-white/50">
          {user?.display_name || user?.email}
        </div>
        <button
          onClick={handleSignOut}
          className="w-full rounded-2xl px-4 py-3 text-left font-medium text-white/50 transition hover:bg-red-500/20 hover:text-white"
        >
          🚪 {t('feed.nav.signOut')}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen-safe bg-[#f7f8f4] font-sans text-slate-900">
      <div className="hidden md:flex">{sidebar}</div>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div className="relative z-50 flex">{sidebar}</div>
        </div>
      )}

      <main className="flex flex-1 flex-col overflow-hidden">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 pr-safe shadow-sm md:px-8">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="-ml-2 rounded-xl p-2 text-xl leading-none text-[#3f7d3f] transition hover:bg-slate-100 md:hidden"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <span className="text-xs font-bold uppercase tracking-widest text-[#3f7d3f]">
              {t('feed.brand')}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="hidden max-w-[30vw] truncate text-xs text-slate-400 sm:inline">
              {user?.email}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
