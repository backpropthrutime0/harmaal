import { useState, useEffect } from 'react';
import api from './api';

interface BusinessSummary {
  total_properties: number;
  total_tenants: number;
  total_revenue: number;
}

export default function Dashboard() {
  const [summary, setSummary] = useState<BusinessSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        const token = localStorage.getItem('token');
        // Hitting your Python business intelligence endpoint!
        const response = await api.get('/business/summary', {
          headers: { Authorization: `Bearer ${token}` }
        });
        setSummary(response.data);
      } catch (err) {
        console.error("Failed to fetch business summary", err);
      } finally {
        setLoading(false);
      }
    };

    fetchSummary();
  }, []);

  if (loading) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="animate-pulse flex space-x-4">
          <div className="flex-1 space-y-4 py-1">
            <div className="h-4 bg-slate-200 rounded w-1/4"></div>
            <div className="h-20 bg-slate-200 rounded w-full"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto animate-fade-in-down">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">Executive Overview</h1>
        <p className="text-slate-500 mt-1">Real-time performance metrics for your portfolio.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Revenue Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-50 rounded-full group-hover:scale-110 transition-transform"></div>
          <div className="relative">
            <h3 className="text-slate-500 font-semibold mb-2 flex items-center">
              <span className="w-2 h-2 rounded-full bg-emerald-500 mr-2"></span>
              Total Revenue
            </h3>
            <div className="text-4xl font-bold text-slate-900">
              ${summary?.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Properties Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-blue-50 rounded-full group-hover:scale-110 transition-transform"></div>
          <div className="relative">
            <h3 className="text-slate-500 font-semibold mb-2 flex items-center">
              <span className="w-2 h-2 rounded-full bg-blue-500 mr-2"></span>
              Active Properties
            </h3>
            <div className="text-4xl font-bold text-slate-900">{summary?.total_properties}</div>
          </div>
        </div>

        {/* Tenants Card */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 relative overflow-hidden group hover:shadow-md transition">
          <div className="absolute -right-4 -top-4 w-24 h-24 bg-purple-50 rounded-full group-hover:scale-110 transition-transform"></div>
          <div className="relative">
            <h3 className="text-slate-500 font-semibold mb-2 flex items-center">
              <span className="w-2 h-2 rounded-full bg-purple-500 mr-2"></span>
              Total Tenants
            </h3>
            <div className="text-4xl font-bold text-slate-900">{summary?.total_tenants}</div>
          </div>
        </div>
      </div>
    </div>
  );
}