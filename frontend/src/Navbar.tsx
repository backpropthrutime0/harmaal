import { Link } from 'react-router-dom';
import { Home, User } from 'lucide-react';

export default function Navbar() {
  return (
    <nav className="flex gap-6 p-4 border-b bg-gray-50">
      <Link to="/" className="flex items-center gap-2"><Home size={20} /> Dashboard</Link>
      <Link to="/profile" className="flex items-center gap-2"><User size={20} /> Profile</Link>
    </nav>
  );
}