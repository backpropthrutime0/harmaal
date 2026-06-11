import { Link } from 'react-router-dom';
import { useAuthStore } from './authStore';

export default function Navbar() {
  const { token, setToken } = useAuthStore();

  return (
    <nav className="flex justify-between items-center p-4 border-b bg-white">
      <div className="flex gap-6">
        <Link to="/" className="font-bold">Harmaal</Link>
        {token && <Link to="/dashboard">Dashboard</Link>}
      </div>
      <div className="flex gap-4">
        {token ? (
          <>
            <Link to="/profile">Profile</Link>
            <button onClick={() => setToken(null)} className="text-red-600">Logout</button>
          </>
        ) : (
          <Link to="/login" className="bg-blue-600 text-white px-4 py-2 rounded">Login</Link>
        )}
      </div>
    </nav>
  );
}