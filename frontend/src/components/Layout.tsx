import { useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../authStore';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
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
  heading: string;
  items: NavItem[];
}

// Staff navigation (admin / owner / manager / maintenance). Visibility is
// driven by permissions, not the coarse role, so the menu always matches what
// the user can actually open.
const STAFF_NAV: NavSection[] = [
  {
    heading: 'Overview',
    items: [{ to: '/dashboard', label: 'Dashboard', icon: '📊' }],
  },
  {
    heading: 'Portfolio',
    items: [
      { to: '/properties', label: 'Properties', icon: '🏢', permission: 'manage_properties' },
      { to: '/financials', label: 'Financials', icon: '💰', permission: 'manage_tenants' },
      { to: '/work-orders', label: 'Maintenance', icon: '🔧', permission: 'manage_maintenance' },
    ],
  },
  {
    heading: 'Administration',
    items: [{ to: '/people', label: 'People', icon: '👥', permission: 'admin' }],
  },
  {
    heading: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: '👤' },
      { to: '/security', label: 'Security', icon: '🔒' },
    ],
  },
];

// Tenant self-service portal.
const TENANT_NAV: NavSection[] = [
  {
    heading: 'My Home',
    items: [
      { to: '/portal', label: 'Overview', icon: '🏠', end: true },
      { to: '/portal/payments', label: 'Payments', icon: '💳' },
      { to: '/portal/maintenance', label: 'Maintenance', icon: '🔧' },
    ],
  },
  {
    heading: 'Account',
    items: [
      { to: '/profile', label: 'Profile', icon: '👤' },
      { to: '/security', label: 'Security', icon: '🔒' },
    ],
  },
];

const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  owner: 'Owner',
  manager: 'Management',
  maintenance: 'Maintenance',
  tenant: 'Resident',
};

export default function Layout({ children }: LayoutProps): ReactElement {
  const navigate = useNavigate();
  const { user, clearSession, hasPermission } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  const role = user?.role ?? 'tenant';
  const roleLabel = ROLE_LABEL[role] ?? 'Portal';

  // Tenants get the portal; everyone else gets the permission-filtered staff nav.
  const sections = role === 'tenant' ? TENANT_NAV : STAFF_NAV;
  const visibleSections = sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => !item.permission || hasPermission(item.permission)),
    }))
    .filter((section) => section.items.length > 0);

  const handleLogout = () => {
    clearSession();
    navigate('/login');
  };

  const sidebar = (
    <aside className="w-64 shrink-0 bg-harmaal-blue text-white flex flex-col shadow-2xl">
      <div className="p-6 border-b border-white/10">
        <div className="text-2xl font-bold tracking-tighter text-white">HARMAAL</div>
        <div className="text-[10px] text-harmaal-gold mt-1 uppercase tracking-widest font-bold">
          {roleLabel}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
        {visibleSections.map((section) => (
          <div key={section.heading}>
            <div className="px-4 pb-3 text-[10px] font-bold uppercase tracking-widest text-white/40">
              {section.heading}
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
                  <span>{item.label}</span>
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
          🚪 Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="flex min-h-screen bg-harmaal-sand font-sans text-slate-900">
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
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-8 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileOpen((open) => !open)}
              className="md:hidden text-harmaal-blue text-xl leading-none p-2 -ml-2 rounded-xl hover:bg-slate-100 transition"
              aria-label="Toggle navigation"
            >
              ☰
            </button>
            <span className="text-harmaal-blue/60 text-xs font-bold uppercase tracking-widest">
              {roleLabel} Workspace
            </span>
          </div>
          <span className="text-slate-400 text-xs truncate max-w-[50%]">{user?.email}</span>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
