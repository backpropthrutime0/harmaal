import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';
import Navbar from './Navbar';

export default function App() {
  return (
    <Router>
      {/* Navbar stays at the top of every page */}
      <Navbar />
      
      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<LoginPage />} />
        
        {/* Protected Routes (Authenticated) */}
        <Route path="/" element={<Dashboard />} />
        <Route path="/profile" element={<div className="p-10">Profile Settings (Coming Soon)</div>} />
        
        {/* Catch-all: Redirects any unknown URL back to Dashboard */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}