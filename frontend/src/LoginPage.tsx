import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from './api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'tenant' | 'employee' | 'manager'>('tenant');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new URLSearchParams();
      formData.append('username', email); 
      formData.append('password', password);
      // Optional: Send the role to the backend if your API requires it
      // formData.append('scope', role); 

      // FIX: Pointed exactly to /login/ to match your Python backend door
      const response = await api.post('/login/', formData, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      localStorage.setItem('token', response.data.access_token);
      
      // Route them based on their role
      if (role === 'tenant') navigate('/portal');
      else navigate('/dashboard');
      
    } catch (err) {
      setError('Invalid credentials. Please try again.');
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Sign In</h1>
          <p className="text-slate-500">Access your Harmaal account.</p>
        </div>

        {/* Role Selector Tabs */}
        <div className="flex bg-slate-100 p-1 rounded-xl mb-8">
          <button 
            type="button"
            onClick={() => setRole('tenant')} 
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              role === 'tenant' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Tenant
          </button>
          <button 
            type="button"
            onClick={() => setRole('employee')} 
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              role === 'employee' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Employee
          </button>
          <button 
            type="button"
            onClick={() => setRole('manager')} 
            className={`flex-1 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              role === 'manager' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Manager
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={role === 'tenant' ? "tenant@email.com" : "name@harmaal.com"}
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Password</label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-700 transition shadow-md"
          >
            {role === 'tenant' ? 'Access Tenant Portal' : 'Access System'}
          </button>
        </form>

        {/* Conditionally Render the Register Link ONLY for Tenants */}
        {role === 'tenant' && (
          <div className="mt-8 text-center text-sm text-slate-500">
            Need to activate your lease?{' '}
            <Link to="/register" className="text-blue-600 font-semibold hover:underline">
              Create tenant profile
            </Link>
          </div>
        )}

      </div>
    </div>
  );
}