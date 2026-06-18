import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import LandingPage from './LandingPage';
import LoginPage from './LoginPage';
import Register from './Register';
import Dashboard from './Dashboard';
import Properties from './Properties';
import PropertyDetail from './PropertyDetail'; 
import Profile from './Profile';
import PrivateRoute from './PrivateRoute';

// NEW: Import the Tenant Portal
import TenantPortal from './TenantPortal';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/register" element={<Register />} />
        <Route path="/login" element={<LoginPage />} /> 

        {/* --- TENANT ROUTE --- */}
        {/* Notice this does NOT have the <Layout> wrapper, so they don't see the Admin sidebar! */}
        <Route path="/portal" element={
          <PrivateRoute>
            <TenantPortal />
          </PrivateRoute>
        } />
        
        {/* --- MANAGER ROUTES --- */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </PrivateRoute>
        } />
        
        <Route path="/properties" element={
          <PrivateRoute>
            <Layout>
              <Properties />
            </Layout>
          </PrivateRoute>
        } />

        <Route path="/properties/:id" element={
          <PrivateRoute>
            <Layout>
              <PropertyDetail />
            </Layout>
          </PrivateRoute>
        } />
        
        <Route path="/profile" element={
          <PrivateRoute>
            <Layout>
              <Profile />
            </Layout>
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}