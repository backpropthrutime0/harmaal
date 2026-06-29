import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../authStore';

interface LayoutProps {
  children: ReactNode;
}

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

// Role-aware navigation. Keys match the coarse user.role.
const NAV: Record<string, NavItem[]> = {
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/properties', label: 'Properties', icon: '🏢' },
    { to: '/financials', label: 'Financials', icon: '💰' },
    { to: '/work-orders', label: 'Maintenance', icon: '🔧' },
    { to: '/people', label: 'People', icon: '👥' },
    { to: '/security', label: 'Settings', icon: '⚙️' },
  ],
  manager: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/properties', label: 'Properties', icon: '🏢' },
    { to: '/financials', label: 'Rent Roll', icon: '💰' },
    { to: '/work-orders', label: 'Maintenance', icon: '🔧' },
    { to: '/security', label: 'Settings', icon: '⚙️' },
  ],
  maintenance: [
    { to: '/dashboard', label: 'Dashboard', icon: '📊' },
    { to: '/work-orders', label: 'Work Orders', icon: '🔧' },
    { to: '/security', label: 'Settings', icon: '⚙️' },
  ],
  tenant: [
    { to: '/portal', label: 'Home', icon: '🏠' },
    { to: '/portal/payments', label: 'Payments', icon: '💳' },
    { to: '/portal/maintenance', label: 'Maintenance', icon: '🔧' },
    { to: '/security', label: 'Settings', icon: '⚙️' },
  ],
};

const ROLE_LABEL: Record<string, string> = {
  admin: 'Owner',
  manager: 'Management',
  maintenance: 'Maintenance',
  tenant: 'Tenant',
};

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, clearSession } = useAuthStore();
  const role = user?.role ?? 'tenant';
  const items = NAV[role] ?? NAV.tenant;

  const handleLogout = () => {
    clearSession();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-harmaal-sand font-sans text-slate-900">
      <aside className="w-64 bg-harmaal-blue text-white flex flex-col shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <div className="text-2xl font-bold tracking-tighter text-white">HARMAAL</div>
          <div className="text-[10px] text-harmaal-gold mt-1 uppercase tracking-widest font-bold">
            {ROLE_LABEL[role] ?? 'Portal'}
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/portal'}
              className={({ isActive }) =>
                `block px-4 py-3 rounded-2xl transition font-semibold ${
                  isActive
                    ? 'bg-harmaal-gold text-white shadow-lg'
                    : 'text-white/70 hover:bg-white/10 hover:text-white'
                }`
              }
            >
              <span className="mr-2">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="px-4 pb-3 text-xs text-white/50 truncate">{user?.display_name || user?.email}</div>
          <button
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded-2xl text-white/50 hover:bg-red-500/20 hover:text-white transition font-medium"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 shadow-sm">
          <span className="text-harmaal-blue/60 text-xs font-bold uppercase tracking-widest">
            {ROLE_LABEL[role] ?? 'Portal'} Workspace
          </span>
          <span className="text-slate-400 text-xs">{user?.email}</span>
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
