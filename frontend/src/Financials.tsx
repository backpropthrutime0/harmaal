import { useEffect, useMemo, useState } from 'react';
import { downloadInvoice, getCharges, recordPayment } from './data/api';
import type { ChargeRow } from './data/types';
import { Badge, Card, EmptyState, Loading, PageHeader, money } from './components/ui';

const FILTERS = ['all', 'overdue', 'pending', 'paid'] as const;
type Filter = (typeof FILTERS)[number];

export default function Financials() {
  const [charges, setCharges] = useState<ChargeRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>('overdue');
  const [busy, setBusy] = useState<number | null>(null);

  const load = () => getCharges().then(setCharges).catch(() => setCharges([]));
  useEffect(() => {
    load();
  }, []);

  const pay = async (id: number) => {
    setBusy(id);
    try {
      await recordPayment(id, 'cash');
      await load();
    } finally {
      setBusy(null);
    }
  };

  const rows = useMemo(
    () => (charges ?? []).filter((c) => (filter === 'all' ? true : c.status === filter)),
    [charges, filter],
  );

  const totals = useMemo(() => {
    const list = charges ?? [];
    return {
      overdue: list.filter((c) => c.status === 'overdue').reduce((s, c) => s + c.amount, 0),
      pending: list.filter((c) => c.status === 'pending').reduce((s, c) => s + c.amount, 0),
      paid: list.filter((c) => c.status === 'paid').reduce((s, c) => s + c.amount, 0),
    };
  }, [charges]);

  if (!charges) return <Loading />;

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <PageHeader title="Rent Roll" subtitle="Track monthly charges, follow up on overdue balances, and record payments." />

      <div className="grid grid-cols-3 gap-6 mb-6">
        <Card className="p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase">Overdue</div>
          <div className="text-2xl font-bold text-red-600 mt-1">{money(totals.overdue)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase">Pending</div>
          <div className="text-2xl font-bold text-amber-600 mt-1">{money(totals.pending)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs font-semibold text-slate-400 uppercase">Collected</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{money(totals.paid)}</div>
        </Card>
      </div>

      <div className="flex gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold capitalize transition ${
              filter === f ? 'bg-harmaal-blue text-white' : 'bg-white text-slate-500 border border-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? (
          <EmptyState>No {filter === 'all' ? '' : filter} charges.</EmptyState>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Tenant</th>
                <th className="px-5 py-3 font-semibold">Unit</th>
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Due</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-5 py-3 font-medium text-slate-800">{c.tenant_name}</td>
                  <td className="px-5 py-3 text-slate-500">{c.unit_label}</td>
                  <td className="px-5 py-3 text-slate-500">{c.period}</td>
                  <td className="px-5 py-3 text-slate-500">{c.due_date}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{money(c.amount)}</td>
                  <td className="px-5 py-3">
                    <Badge value={c.status} />
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {c.status !== 'paid' ? (
                        <button
                          onClick={() => pay(c.id)}
                          disabled={busy === c.id}
                          className="bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          {busy === c.id ? '…' : 'Record payment'}
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">{c.paid_date}</span>
                      )}
                      <button
                        onClick={() => downloadInvoice(c.id)}
                        title="Download PDF to send to the tenant"
                        className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        ⤓ {c.status === 'paid' ? 'Receipt' : c.status === 'overdue' ? 'Reminder' : 'Invoice'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
