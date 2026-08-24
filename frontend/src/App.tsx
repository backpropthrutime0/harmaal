import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import { Loading } from './components/ui';
import LandingPage from './LandingPage';
import LoginPage from './LoginPage';
import Register from './Register';
import Dashboard from './Dashboard';
import Properties from './Properties';
import PropertyDetail from './PropertyDetail';
import Profile from './Profile';
import PrivateRoute from './PrivateRoute';
import ChangePassword from './ChangePassword';
import SecuritySettings from './SecuritySettings';
import Financials from './Financials';
import WorkOrders from './WorkOrders';
import WorkOrderDetail from './WorkOrderDetail';
import People from './People';
import Employees from './Employees';
import TenantPortal from './TenantPortal';
import TenantPayments from './TenantPayments';
import TenantMaintenance from './TenantMaintenance';

// Lazy-loaded so recharts (~100kb) only ships when a view_business user opens it.
const Analytics = lazy(() => import('./analytics'));

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/tenant-login" element={<LoginPage tenant />} />
        <Route path="/change-password" element={<ChangePassword />} />

        {/* Dashboard (role-dispatched: owner / manager / maintenance) */}
        <Route path="/dashboard" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />

        {/* Properties (manage_properties) */}
        <Route path="/properties" element={<PrivateRoute permission="manage_properties"><Layout><Properties /></Layout></PrivateRoute>} />
        <Route path="/properties/:id" element={<PrivateRoute permission="manage_properties"><Layout><PropertyDetail /></Layout></PrivateRoute>} />

        {/* Financials / rent roll (manage_tenants) */}
        <Route path="/financials" element={<PrivateRoute permission="manage_tenants"><Layout><Financials /></Layout></PrivateRoute>} />

        {/* Analytics / business intelligence (view_business — admin-only by default;
            an admin can grant the permission to another role from /people) */}
        <Route
          path="/analytics"
          element={
            <PrivateRoute permission="view_business">
              <Layout>
                <Suspense fallback={<Loading label="Loading analytics…" />}>
                  <Analytics />
                </Suspense>
              </Layout>
            </PrivateRoute>
          }
        />

        {/* Work orders — list for staff+maintenance; detail accessible to any involved party */}
        <Route path="/work-orders" element={<PrivateRoute permission="manage_maintenance"><Layout><WorkOrders /></Layout></PrivateRoute>} />
        <Route path="/work-orders/:id" element={<PrivateRoute><Layout><WorkOrderDetail /></Layout></PrivateRoute>} />

        {/* Employees (manage_staff: managers onboard staff; admins may also use it) */}
        <Route path="/employees" element={<PrivateRoute permission="manage_staff"><Layout><Employees /></Layout></PrivateRoute>} />

        {/* People / IAM (admin) */}
        <Route path="/people" element={<PrivateRoute permission="admin"><Layout><People /></Layout></PrivateRoute>} />

        {/* Tenant portal */}
        <Route path="/portal" element={<PrivateRoute><Layout><TenantPortal /></Layout></PrivateRoute>} />
        <Route path="/portal/payments" element={<PrivateRoute><Layout><TenantPayments /></Layout></PrivateRoute>} />
        <Route path="/portal/maintenance" element={<PrivateRoute><Layout><TenantMaintenance /></Layout></PrivateRoute>} />

        {/* Shared */}
        <Route path="/profile" element={<PrivateRoute><Layout><Profile /></Layout></PrivateRoute>} />
        <Route path="/security" element={<PrivateRoute><Layout><SecuritySettings /></Layout></PrivateRoute>} />
      </Routes>
    </Router>
  );
}
