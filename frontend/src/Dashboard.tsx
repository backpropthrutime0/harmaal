import { useAuthStore } from './authStore';
import AdminDashboard from './dashboards/AdminDashboard';
import ManagerDashboard from './dashboards/ManagerDashboard';
import MaintenanceDashboard from './dashboards/MaintenanceDashboard';

/** Renders the dashboard appropriate to the signed-in user's role. */
export default function Dashboard() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'admin') return <AdminDashboard />;
  if (role === 'maintenance') return <MaintenanceDashboard />;
  return <ManagerDashboard />; // manager (and any other staff) default
}
