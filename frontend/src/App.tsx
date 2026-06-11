import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import LandingPage from './LandingPage';
import LoginPage from './LoginPage';
import Dashboard from './Dashboard';
import Navbar from './Navbar';
import PrivateRoute from './PrivateRoute';
import Profile from './Profile'; // Imported your Profile component

export default function App() {
  return (
    <Router>
      <Navbar />
      <Routes>
        {/* Public Routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        
        {/* Private Routes */}
        <Route path="/dashboard" element={
          <PrivateRoute>
            <Dashboard />
          </PrivateRoute>
        } />
        <Route path="/profile" element={
          <PrivateRoute>
            <Profile />
          </PrivateRoute>
        } />
      </Routes>
    </Router>
  );
}