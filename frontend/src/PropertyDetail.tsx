import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from './api';

interface Payment {
  id: number;
  amount: number;
  date: string;
}

interface Tenant {
  id: number;
  name: string;
  email: string;
  rent_amount: number;
  lease_start_date: string;
  lease_end_date: string;
  payments: Payment[];
}

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>(); 
  const [tenants, setTenants] = useState<Tenant[]>([]);
  
  const [showTenantModal, setShowTenantModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  
  // Tenant Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [rentAmount, setRentAmount] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // --- NEW: Account Creation State ---
  const [createAccount, setCreateAccount] = useState(false);
  const [tempPassword, setTempPassword] = useState('');

  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]); 
  const [toast, setToast] = useState('');

  const fetchTenants = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await api.get(`/properties/${id}/tenants/`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTenants(response.data);
    } catch (err) {
      console.error("Failed to fetch tenants", err);
    }
  };

  useEffect(() => {
    fetchTenants();
  }, [id]);

  // --- UPDATED: ADD TENANT & CREATE ACCOUNT LOGIC ---
  const handleAddTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      
      // 1. Create the lease record for the property
      await api.post(`/properties/${id}/tenants/`, {
        name,
        email,
        rent_amount: parseFloat(rentAmount),
        lease_start_date: startDate,
        lease_end_date: endDate
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // 2. If the box was checked, create their portal login!
      if (createAccount && tempPassword) {
        try {
          // Hits the same route your own Admin registration uses, but assigns 'tenant' role
          await api.post('/users/', {
            email: email,
            password: tempPassword,
            role: 'tenant'
          });
          setToast("Lease activated and Tenant Portal account created!");
        } catch (accountErr) {
          console.error(accountErr);
          alert("Lease was created, but the portal account failed (they might already have one).");
        }
      } else {
        setToast("Lease successfully activated!");
      }
      
      setShowTenantModal(false);
      setName(''); setEmail(''); setRentAmount(''); setStartDate(''); setEndDate('');
      setCreateAccount(false); setTempPassword('');
      fetchTenants(); 
      setTimeout(() => setToast(''), 4000);
    } catch (err) {
      alert("Failed to register tenant lease.");
    }
  };

  const openPaymentModal = (tenant: Tenant) => {
    setSelectedTenant(tenant);
    setPaymentAmount(tenant.rent_amount.toString()); 
    setShowPaymentModal(true);
  };

  const handleCollectRent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTenant) return;

    try {
      const token = localStorage.getItem('token');
      await api.post(`/tenants/${selectedTenant.id}/payments/`, {
        amount: parseFloat(paymentAmount),
        date: paymentDate
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setShowPaymentModal(false);
      setToast(`Successfully collected $${paymentAmount} from ${selectedTenant.name}`);
      fetchTenants(); 
      setTimeout(() => setToast(''), 3000);
    } catch (err) {
      alert("Failed to process payment.");
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto relative">
      {toast && (
        <div className="fixed top-4 right-4 bg-emerald-600 text-white px-6 py-3 rounded-xl shadow-lg font-semibold z-50">
          ✓ {toast}
        </div>
      )}

      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Property Management</h1>
          <p className="text-slate-500 mt-1">Viewing records for Property ID: {id}</p>
        </div>
        <button 
          onClick={() => setShowTenantModal(true)}
          className="bg-slate-900 text-white px-5 py-2.5 rounded-xl font-semibold hover:bg-slate-800 transition shadow-sm"
        >
          + Register Tenant
        </button>
      </div>

      {/* Tenant Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="p-4 font-semibold text-slate-600 text-sm">Tenant Name</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Monthly Rent</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Lease Term</th>
              <th className="p-4 font-semibold text-slate-600 text-sm">Payments Logged</th>
              <th className="p-4 font-semibold text-slate-600 text-sm text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {tenants.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500 italic">No tenants registered for this property yet.</td>
              </tr>
            ) : (
              tenants.map(tenant => (
                <tr key={tenant.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="p-4 font-bold text-slate-900">
                    {tenant.name}
                    <div className="text-xs text-slate-400 font-normal">{tenant.email}</div>
                  </td>
                  <td className="p-4 font-semibold text-slate-700">${tenant.rent_amount}</td>
                  <td className="p-4 text-slate-500 text-sm">
                    {tenant.lease_start_date} <span className="text-slate-300 mx-1">→</span> {tenant.lease_end_date}
                  </td>
                  <td className="p-4 text-sm font-semibold text-emerald-600">
                    {tenant.payments.length} Transaction(s)
                  </td>
                  <td className="p-4 text-right flex justify-end space-x-2">
                    <button 
                      onClick={() => openPaymentModal(tenant)}
                      className="bg-blue-50 text-blue-700 text-sm font-bold hover:bg-blue-600 hover:text-white px-3 py-1.5 rounded-lg transition"
                    >
                      Collect Rent
                    </button>
  
                    <button 
                      onClick={() => { /* Add logic to open an Edit Modal */ }}
                      className="text-slate-400 hover:text-blue-600 transition"
                    >
                      Edit
                    </button>

                    <button
                      onClick={async () => {
                        if (window.confirm("Terminate this lease?")) {
                          await api.delete(`/tenants/${tenant.id}`, {
                            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
                          });
                          fetchTenants();
                        }
                      }}
                      className="text-slate-400 hover:text-red-600 transition"
                    >
                      Remove
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Tenant Modal */}
      {showTenantModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-6 text-slate-900">Initialize Lease Agreement</h2>
            <form onSubmit={handleAddTenant} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Full Name</label>
                <input type="text" required value={name} onChange={e => setName(e.target.value)} placeholder="Tenant Name" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="tenant@example.com" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Monthly Rent Amount ($)</label>
                <input type="number" step="0.01" required value={rentAmount} onChange={e => setRentAmount(e.target.value)} placeholder="0.00" className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">Start Date</label>
                  <input type="date" required value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">End Date</label>
                  <input type="date" required value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                </div>
              </div>

              {/* NEW: Portal Access Checkbox */}
              <div className="pt-4 mt-4 border-t border-slate-100">
                <label className="flex items-center space-x-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={createAccount} 
                    onChange={e => setCreateAccount(e.target.checked)}
                    className="w-5 h-5 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
                  />
                  <span className="font-semibold text-slate-700">Generate Tenant Portal Access</span>
                </label>
                
                {createAccount && (
                  <div className="mt-4 animate-fade-in-down">
                    <label className="block text-sm font-semibold text-slate-700 mb-2">Temporary Password</label>
                    <input 
                      type="text" 
                      required={createAccount}
                      value={tempPassword} 
                      onChange={e => setTempPassword(e.target.value)} 
                      placeholder="e.g., ChangeMe123!" 
                      className="w-full px-4 py-2.5 rounded-xl border border-blue-200 bg-blue-50 focus:ring-2 focus:ring-blue-500 outline-none" 
                    />
                    <p className="text-xs text-slate-500 mt-2">Give this password to the tenant so they can log in.</p>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 mt-8">
                <button type="button" onClick={() => setShowTenantModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 transition">Activate Lease</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Payment Modal (Unchanged) */}
      {showPaymentModal && selectedTenant && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-8 rounded-2xl w-full max-w-sm shadow-xl animate-fade-in-down">
            <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center text-2xl mb-4">
              💰
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Log Payment</h2>
            <p className="text-slate-500 text-sm mt-1 mb-6">Collecting rent from <span className="font-bold text-slate-700">{selectedTenant.name}</span></p>
            
            <form onSubmit={handleCollectRent} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Amount Received ($)</label>
                <input type="number" step="0.01" required value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none font-bold text-lg" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-2">Date Received</label>
                <input type="date" required value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none" />
              </div>
              
              <div className="flex space-x-3 mt-8">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 px-4 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 transition">Cancel</button>
                <button type="submit" className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 transition shadow-md">Confirm Payment</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}