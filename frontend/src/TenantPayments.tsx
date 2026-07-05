import { useEffect, useState } from 'react';
import { downloadMyInvoice, getMyCharges } from './data/api';
import type { Charge } from './data/types';
import { Badge, Card, EmptyState, Loading, PageHeader, TableScroll, money } from './components/ui';

export default function TenantPayments() {
  const [charges, setCharges] = useState<Charge[] | null>(null);

  useEffect(() => {
    getMyCharges().then(setCharges).catch(() => setCharges([]));
  }, []);

  if (!charges) return <Loading />;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto">
      <PageHeader title="Payments" subtitle="Your monthly rent ledger." />
      <Card>
        {charges.length === 0 ? (
          <EmptyState>No charges on file.</EmptyState>
        ) : (
          <TableScroll minWidth="min-w-[680px]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-5 py-3 font-semibold">Period</th>
                <th className="px-5 py-3 font-semibold">Due</th>
                <th className="px-5 py-3 font-semibold">Amount</th>
                <th className="px-5 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 font-semibold">Paid</th>
                <th className="px-5 py-3 font-semibold text-right">Invoice</th>
              </tr>
            </thead>
            <tbody>
              {charges.map((c) => (
                <tr key={c.id} className="border-b border-slate-50">
                  <td className="px-5 py-3 font-medium text-slate-800">{c.period}</td>
                  <td className="px-5 py-3 text-slate-500">{c.due_date}</td>
                  <td className="px-5 py-3 font-semibold text-slate-800">{money(c.amount)}</td>
                  <td className="px-5 py-3">
                    <Badge value={c.status} />
                  </td>
                  <td className="px-5 py-3 text-slate-500">{c.paid_date ?? '—'}</td>
                  <td className="px-5 py-3 text-right">
                    <button
                      onClick={() => downloadMyInvoice(c.id)}
                      className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
                    >
                      ⤓ {c.status === 'paid' ? 'Receipt' : 'Invoice'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </TableScroll>
        )}
      </Card>
      <p className="text-xs text-slate-400 mt-4">
        Payments are recorded by management. Questions about a charge? Contact your property manager.
      </p>
    </div>
  );
}
