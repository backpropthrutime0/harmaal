import { useEffect, useState } from 'react';
import api from './api';
import { Building } from 'lucide-react';

export default function Dashboard() {
  const [properties, setProperties] = useState([]);

  useEffect(() => {
    api.get('/properties/').then((res) => setProperties(res.data)).catch(() => console.log("Fetch failed - check backend"));
  }, []);

  return (
    <div className="p-10">
      <h1 className="text-3xl font-bold mb-6">Property Portfolio</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {properties.map((p: any) => (
          <div key={p.id} className="border p-6 rounded-xl shadow-sm hover:shadow-md transition">
            <Building className="text-blue-600 mb-2" />
            <h2 className="text-xl font-bold">{p.name}</h2>
            <p className="text-gray-600">{p.address}</p>
          </div>
        ))}
      </div>
    </div>
  );
}