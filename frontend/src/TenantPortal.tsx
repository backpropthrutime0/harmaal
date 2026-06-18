import { useState, useEffect } from 'react';
import api from './api';

interface Payment {
  id: number;
  amount: number;
  date: string;
}

interface TenantData {
  id: number;
  name: string;
  email: string;
  rent_amount: number;
  lease_start_date: string;
  lease_end_date: string;
  payments: Payment[];
}

export default function TenantPortal() {
  const [lease, setLease] = useState<TenantData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMyLease = async () => {
      try {
        const token = localStorage.getItem('token');
        // Hitting our brand new Python endpoint!
        const response = await api.get('/tenants/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setLease(response.data);
      } catch (err) {
        setError("Could not load your lease data. Please contact management.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyLease();
  }, []);

  if (loading) return <div className="p-8 text-center text-slate-500">Loading your portal...</div>;
  if (error || !lease) return <div className="p-8 text-center text-red-500 font-bold">{error}</div>;

  return (
    <div className="p-8 max-w-4xl mx-auto animate-fade-in-down">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Welcome back, {lease.name}</h1>
        <p className="text-slate-500 mt-1">Manage your lease and view payment history.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Rent Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1">Monthly Rent Due</div>
          <div className="text-3xl font-bold text-slate-900">${lease.rent_amount}</div>
        </div>
        
        {/* Lease Start */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1">Lease Start</div>
          <div className="text-xl font-bold text-slate-800">{lease.lease_start_date}</div>
        </div>

        {/* Lease End */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-slate-500 text-sm font-semibold mb-1">Lease Expiration</div>
          <div className="text-xl font-bold text-slate-800">{lease.lease_end_date}</div>
        </div>
      </div>

      {/* Payment Ledger */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50">
          <h2 className="text-lg font-bold text-slate-800">Payment Ledger</h2>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white border-b border-slate-100">
              <th className="p-4 font-semibold text-slate-500 text-sm">Receipt ID</th>
              <th className="p-4 font-semibold text-slate-500 text-sm">Date Processed</th>
              <th className="p-4 font-semibold text-slate-500 text-sm text-right">Amount Paid</th>
            </tr>
          </thead>
          <tbody>
            {lease.payments.length === 0 ? (
              <tr>
                <td colSpan={3} className="p-8 text-center text-slate-400 italic">No payments logged yet.</td>
              </tr>
            ) : (
              lease.payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                  <td className="p-4 text-slate-500 font-mono text-sm">#TXN-{payment.id.toString().padStart(4, '0')}</td>
                  <td className="p-4 font-medium text-slate-800">{payment.date}</td>
                  <td className="p-4 font-bold text-emerald-600 text-right">${payment.amount}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}