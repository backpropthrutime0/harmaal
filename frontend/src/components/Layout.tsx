import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../authStore';
import { useT, type MessageKey } from '../i18n';
import { LanguageSwitcher } from './LanguageSwitcher';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  /** i18n key for the link label. */
  labelKey: MessageKey;
  icon: string;
  /** Match the path exactly (for index-style routes like /portal). */
  end?: boolean;
  /**
   * Fine-grained permission required to see this link. Omit for links every
   * authenticated user can reach. Kept in lockstep with the route guards in
   * App.tsx so a visible link never bounces the user back to /dashboard.
   */
  permission?: string;
}

interface NavSection {
  headingKey: MessageKey;
  items: NavItem[];
}

// Staff navigation (admin / owner / manager / maintenance). Visibility is
// driven by permissions, not the coarse role, so the menu always matches what
// the user can actually open.
const STAFF_NAV: NavSection[] = [
  {
    headingKey: 'nav.section.overview',
    items: [{ to: '/dashboard', labelKey: 'nav.dashboard', icon: '📊' }],
  },
  {
    headingKey: 'nav.section.portfolio',
    items: [
      { to: '/properties', labelKey: 'nav.properties', icon: '🏢', permission: 'manage_properties' },
      { to: '/financials', labelKey: 'nav.financials', icon: '💰', permission: 'manage_tenants' },
      { to: '/work-orders', labelKey: 'nav.maintenance', icon: '🔧', permission: 'manage_maintenance' },
    ],
  },
  {
    headingKey: 'nav.section.insights',
    // view_business is admin-only by default; admins can grant it per-role from /people.
    items: [{ to: '/analytics', labelKey: 'nav.analytics', icon: '📈', permission: 'view_business' }],
  },
  {
    headingKey: 'nav.section.administration',
    items: [
      { to: '/employees', labelKey: 'nav.employees', icon: '🧑‍💼', permission: 'manage_staff' },
      { to: '/people', labelKey: 'nav.people', icon: '👥', permission: 'admin' },
    ],
  },
  {
    headingKey: 'nav.section.account',
    items: [
      { to: '/profile', labelKey: 'nav.profile', icon: '👤' },
      { to: '/security', labelKey: 'nav.security', icon: '🔒' },
    ],
  },
];

// Tenant self-service portal.
const TENANT_NAV: NavSection[] = [
  {
    headingKey: 'nav.section.myHome',
    items: [
      { to: '/portal', labelKey: 'nav.portalOverview', icon: '🏠', end: true },
      { to: '/portal/payments', labelKey: 'nav.payments', icon: '💳' },
      { to: '/portal/maintenance', labelKey: 'nav.maintenance', icon: '🔧' },
    ],
  },
  {
    headingKey: 'nav.section.account',
    items: [
      { to: '/profile', labelKey: 'nav.profile', icon: '👤' },
      { to: '/security', labelKey: 'nav.security', icon: '🔒' },
    ],
  },
];

const ROLE_LABEL_KEY: Record<string, MessageKey> = {
  admin: 'role.admin',
  owner: 'role.owner',
  manager: 'role.manager',
  maintenance: 'role.maintenance',
  tenant: 'role.tenant',
};

export default function Layout({ children }: LayoutProps): ReactElement {
  const navigate = useNavigate();
  const t = useT();
  const { user, clearSession, hasPermission } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role ?? 'tenant';
  const roleLabel = t(ROLE_LABEL_KEY[role] ?? 'role.portal');

  // Tenants get the portal; everyone else gets the permission-filtered staff nav.
  const sections = role === 'tenant' ? TENANT_NAV : STAFF_NAV;
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const handleLogout = () => {
    // Capture the role before clearing the session so residents return to their
    // own sign-in page rather than the staff/management login.
    const loginPath = role === 'tenant' ? '/tenant-login' : '/login';
    clearSession();
    navigate(loginPath);
  };

  const sidebar = (
    <aside className="w-64 max-w-[85vw] shrink-0 bg-harmaal-blue text-white flex flex-col shadow-2xl pt-safe pb-safe pl-safe">
      <div className="p-6 border-b border-white/10">
        {/* The wordmark doubles as a shortcut back to the public homepage. */}
        <button
          type="button"
          onClick={() => {
            setMobileOpen(false);
            navigate('/');
          }}
          className="text-left w-full rounded-xl transition hover:opacity-90"
        >
          <div className="text-2xl font-bold tracking-tighter text-white">HARMAAL</div>
          <div className="text-[10px] text-harmaal-gold mt-1 uppercase tracking-widest font-bold">
            {roleLabel}
          </div>
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {/* Always-visible shortcut back to the public homepage — first item so
            both staff and tenant pages have an obvious way home. */}
        <div>
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              navigate('/');
            }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl transition font-semibold text-white/80 bg-white/5 hover:bg-white/15 hover:text-white"
          >
            <span className="text-lg leading-none">🏠</span>
            <span>{t('nav.home')}</span>
          </button>
        </div>

        {visibleSections.map((section) => (
          <div key={section.headingKey}>
            <div className="px-4 pb-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {t(section.headingKey)}
            </div>
            <div className="space-y-1.5">
              {section.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-2xl transition font-semibold ${
                      isActive
                        ? 'bg-harmaal-gold text-white shadow-lg'
                        : 'text-white/70 hover:bg-white/10 hover:text-white'
                    }`
                  }
                >
                  <span className="text-lg leading-none">{item.icon}</span>
                  <span>{t(item.labelKey)}</span>
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="px-4 pb-3 text-xs text-white/50 truncate">
          {user?.display_name || user?.email}
        </div>
        <button
          onClick={handleLogout}
          className="w-full text-left px-4 py-3 rounded-2xl text-white/50 hover:bg-red-500/20 hover:text-white transition font-medium"
        >
          🚪 {t('nav.signOut')}
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen-safe bg-harmaal-sand font-sans text-slate-900">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">{sidebar}</div>

      {/* Mobile drawer */}
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

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 pr-safe shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="md:hidden text-harmaal-blue text-xl leading-none p-2 -ml-2 rounded-xl hover:bg-slate-100 transition"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            {/* Home shortcut — returns to the main public homepage from any page. */}
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-harmaal-blue font-semibold text-sm px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-100 transition"
              aria-label={t('nav.home')}
              title={t('nav.home')}
            >
              <span className="text-base leading-none">🏠</span>
              <span>{t('nav.home')}</span>
            </button>
            <span className="hidden md:inline text-harmaal-blue/60 text-xs font-bold uppercase tracking-widest">
              {t('nav.workspace', { role: roleLabel })}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <span className="hidden sm:inline text-slate-400 text-xs truncate max-w-[30vw]">
              {user?.email}
            </span>
          </div>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
