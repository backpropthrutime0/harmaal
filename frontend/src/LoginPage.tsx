import { useState } from 'react';
import api from './api';
import { useAuthStore } from './authStore';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const setToken = useAuthStore((state) => state.setToken);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const params = new URLSearchParams();
      params.append('username', email); 
      params.append('password', password);

      const res = await api.post('/login', params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
      
      setToken(res.data.access_token);
      navigate('/dashboard');
    } catch (err: any) {
      console.error("Login Error Details:", err.response?.data);
      alert(`Login Failed: ${err.response?.data?.detail || "Check console for details"}`);
    }
  };

  return (
    <form onSubmit={handleLogin} className="flex flex-col gap-4 max-w-sm mx-auto mt-20 p-6 border rounded-xl shadow-lg">
      <h2 className="text-2xl font-bold mb-4">Login</h2>
      <input 
        className="border p-2 rounded" 
        placeholder="Email" 
        value={email}
        onChange={(e) => setEmail(e.target.value)} 
      />
      <input 
        className="border p-2 rounded" 
        type="password" 
        placeholder="Password" 
        value={password}
        onChange={(e) => setPassword(e.target.value)} 
      />
      <button className="bg-blue-600 text-white p-2 rounded hover:bg-blue-700 transition">
        Login
      </button>
    </form>
  );
}