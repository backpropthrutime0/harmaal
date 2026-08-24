import { useState, useEffect } from 'react';
import api from './api';

interface Property {
  id: number;
  address: string;
  description: string;
  units: number;
}

export default function Properties() {
  const [showAddForm, setShowAddForm] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [newAddress, setNewAddress] = useState('');
  const [newDescription, setNewDescription] = useState('Residential');
  const [newUnits, setNewUnits] = useState('');
  const [toast, setToast] = useState(''); 

  const fetchProperties = () => {
    const token = localStorage.getItem('token');
    return api
      .get('/properties/', { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => setProperties(response.data))
      .catch((err) => console.error('Failed to fetch properties:', err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchProperties();
  }, []);

  const handleAddProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      await api.post('/properties/', {
        address: newAddress,
        description: newDescription,
        units: parseInt(newUnits)
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setToast('Property successfully added to portfolio!');
      setShowAddForm(false);
      setNewAddress('');
      setNewDescription('Residential');
      setNewUnits('');
      fetchProperties(); 

      setTimeout(() => setToast(''), 3000);
    } catch {
      alert("Failed to add property. Please check your inputs.");
    }
  };

  // --- NEW: DELETE PROPERTY LOGIC ---
  const handleDeleteProperty = async (id: number, address: string) => {
    // Safety check before deleting
    if (!window.confirm(`Are you absolutely sure you want to demolish ${address}? This will also delete all tenant records and payment history associated with it.`)) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await api.delete(`/properties/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setToast(`${address} has been removed from your portfolio.`);
      fetchProperties(); // Refresh the grid
      setTimeout(() => setToast(''), 3000);
    } catch {
      alert("Failed to delete property. Make sure you have admin privileges.");
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto relative">
      {toast && (
        <div className="fixed top-4 right-4 left-4 sm:left-auto bg-green-600 text-white px-6 py-3 rounded-xl shadow-lg font-semibold animate-fade-in-down z-50">
          ✓ {toast}
        </div>
      )}

      <div className="flex flex-col gap-4 mb-6 sm:mb-8 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">Property Portfolio</h1>
          <p className="text-slate-500 mt-1">Manage your buildings and operational assets.</p>
        </div>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          className="bg-blue-600 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-blue-700 transition shadow-sm shrink-0"
        >
          {showAddForm ? 'Cancel' : '+ Add New Property'}
        </button>
      </div>

      {showAddForm && (
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 mb-8 animate-fade-in-down">
          <h2 className="text-xl font-bold text-slate-800 mb-4">Register New Asset</h2>
          <form onSubmit={handleAddProperty} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Property Name / Address</label>
              <input type="text" required value={newAddress} onChange={e => setNewAddress(e.target.value)} placeholder="e.g., Jigjiga Yar Apartments" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Asset Type</label>
              <select value={newDescription} onChange={e => setNewDescription(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none bg-white">
                <option>Residential</option>
                <option>Commercial</option>
                <option>Mixed Use</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Total Units</label>
              <input type="number" required min="1" value={newUnits} onChange={e => setNewUnits(e.target.value)} placeholder="0" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
            <div className="md:col-span-4 mt-2">
              <button type="submit" className="bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold hover:bg-slate-800 transition">
                Save Property to Database
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-slate-500 font-medium">Loading portfolio...</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {properties.map((prop) => (
            <div key={prop.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition group">
              <div className="flex justify-between items-start mb-4">
                <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 text-xl group-hover:scale-110 transition-transform">🏢</div>
                
                {/* NEW: Delete Button */}
                <button 
                  onClick={() => handleDeleteProperty(prop.id, prop.address)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  title="Delete Property"
                >
                  <svg xmlns="http://www.w3.org/w/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
              
              <h3 className="text-xl font-bold text-slate-900 mb-1">{prop.address}</h3>
              <p className="text-slate-500 text-sm mb-6">{prop.description}</p>
              
              <div className="flex justify-between items-center pt-4 border-t border-slate-100">
                <div className="text-slate-600 font-medium">
                  <span className="text-slate-900 font-bold">{prop.units}</span> Units
                </div>
                <a href={`/properties/${prop.id}`} className="text-blue-600 text-sm font-bold hover:underline">
                  Manage &rarr;
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}