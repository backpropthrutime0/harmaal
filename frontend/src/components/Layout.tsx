import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

interface LayoutProps {
  children: ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-harmaal-sand font-sans text-slate-900">
      
      {/* Sidebar - Now in Harmaal Berbera Blue */}
      <aside className="w-64 bg-harmaal-blue text-white flex flex-col shadow-2xl">
        <div className="p-6 border-b border-white/10">
          <div className="text-2xl font-bold tracking-tighter text-white">
            HARMAAL
          </div>
          <div className="text-[10px] text-harmaal-gold mt-1 uppercase tracking-widest font-bold">
            Enterprise Portal
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <NavLink 
            to="/dashboard" 
            className={({ isActive }) => 
              `block px-4 py-3 rounded-2xl transition font-semibold ${isActive ? 'bg-harmaal-gold text-white shadow-lg' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
            }
          >
            📊 Overview
          </NavLink>
          
          <NavLink 
            to="/properties" 
            className={({ isActive }) => 
              `block px-4 py-3 rounded-2xl transition font-semibold ${isActive ? 'bg-harmaal-gold text-white shadow-lg' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
            }
          >
            🏢 Properties
          </NavLink>

          <NavLink 
            to="/profile" 
            className={({ isActive }) => 
              `block px-4 py-3 rounded-2xl transition font-semibold ${isActive ? 'bg-harmaal-gold text-white shadow-lg' : 'text-white/70 hover:bg-white/10 hover:text-white'}`
            }
          >
            ⚙️ Settings
          </NavLink>
        </nav>

        <div className="p-4 border-t border-white/10">
          <button 
            onClick={handleLogout}
            className="w-full text-left px-4 py-3 rounded-2xl text-white/50 hover:bg-red-500/20 hover:text-white transition font-medium"
          >
            🚪 Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="h-16 bg-white border-b border-slate-200 flex items-center px-8 shadow-sm">
          <span className="text-harmaal-blue/60 text-xs font-bold uppercase tracking-widest">Secure Portfolio Environment</span>
        </div>
        
        <div className="flex-1 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  );
}