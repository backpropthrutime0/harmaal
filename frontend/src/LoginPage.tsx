import { useState } from 'react';
import api from './api';
import { useAuthStore } from './authStore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const setToken = useAuthStore((state) => state.setToken);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const formData = new FormData();
      formData.append('username', email);
      formData.append('password', password);
      
      const response = await api.post('/login/', formData);
      setToken(response.data.access_token);
      alert('Login successful!');
    } catch (error) {
      alert('Invalid Credentials');
    }
  };

  return (
    <form onSubmit={handleLogin} className="p-10 flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Harmaal ERP Login</h1>
      <input type="email" placeholder="Email" onChange={(e) => setEmail(e.target.value)} className="border p-2" />
      <input type="password" placeholder="Password" onChange={(e) => setPassword(e.target.value)} className="border p-2" />
      <button type="submit" className="bg-blue-600 text-white p-2">Login</button>
    </form>
  );
}