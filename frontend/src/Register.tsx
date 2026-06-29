import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register, errorMessage } from './auth/authApi';

export default function Register() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false); // New state for password visibility
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      // Self-registration creates a tenant account. Staff (admin/manager/maintenance)
      // are provisioned by an admin via /auth/users — never self-registered.
      await register(email, password, 'tenant');
      navigate('/login');
    } catch (err) {
      setError(errorMessage(err, 'Failed to create account. Please try again.'));
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md bg-white p-8 rounded-2xl shadow-sm border border-slate-100">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Become a Tenant</h1>
          <p className="text-slate-500">Create your Harmaal tenant account.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm text-center">
            {error}
          </div>
        )}

        <form onSubmit={handleRegister} className="space-y-5">
          {/* Side-by-side First and Last Name */}
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-2">First Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Last Name</label>
              <input
                type="text"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
              />
            </div>
          </div>

          {/* Phone Number Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Phone Number</label>
            <input
              type="tel"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+252 63 XXX XXXX"
            />
          </div>

          {/* Email Field */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="example@harmaal.com"
            />
          </div>

          {/* Password Field with Show/Hide Toggle */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Secure Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition pr-16"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-slate-400 hover:text-slate-700 focus:outline-none transition"
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              At least 12 characters with upper, lower, number, and a symbol.
            </p>
          </div>
          
          <button
            type="submit"
            className="w-full bg-blue-600 text-white font-bold py-3 mt-2 rounded-xl hover:bg-blue-700 transition shadow-md"
          >
            Initialize Account
          </button>
        </form>

        <div className="mt-8 text-center text-sm text-slate-500">
          Already have an account?{' '}
          <Link to="/login" className="text-blue-600 font-semibold hover:underline">
            Sign in securely
          </Link>
        </div>
      </div>
    </div>
  );
}