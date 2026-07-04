import { useEffect, useState } from 'react';
import {
  createExpense,
  deleteExpense,
  downloadInvoice,
  getCharges,
  getMonthlyFinancials,
  getProperties,
  listExpenses,
  listWorkOrders,
  setDeposited,
} from '../data/api';
import type { ChargeRow, Expense, MonthlyFinancials as MF, Property, WorkOrder } from '../data/types';
import { EXPENSE_CATEGORIES } from '../data/types';
import { Badge, Card, EmptyState, Loading, Modal, money, money2 } from '../components/ui';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// --- overview table ------------------------------------------------------

export function MonthlyFinancials() {
  const [rows, setRows] = useState<MF[] | null>(null);
  const [openPeriod, setOpenPeriod] = useState<string | null>(null);

  const load = () => getMonthlyFinancials(12).then(setRows).catch(() => setRows([]));
  useEffect(() => {
    load();
  }, []);

  if (!rows) return <Card className="p-6"><Loading label="Loading financials…" /></Card>;

  return (
    <>
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-bold text-slate-800">Monthly Financials</h2>
            <p className="text-xs text-slate-400">
              Rent due vs. collected, and how collected cash was handled. Click a month to manage
              deposits and expenses.
            </p>
          </div>
        </div>
        {rows.length === 0 ? (
          <EmptyState>No financial data yet.</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="border-b border-slate-100">
                  <Th>Month</Th>
                  <Th right>Due</Th>
                  <Th right>Collected</Th>
                  <Th right>Outstanding</Th>
                  <Th right>Cash on hand</Th>
                  <Th right>Deposited</Th>
                  <Th right>Spent</Th>
                  <Th right>To deposit</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.period}
                    onClick={() => setOpenPeriod(r.period)}
                    className="border-b border-slate-50 last:border-0 cursor-pointer hover:bg-slate-50"
                  >
                    <Td className="font-semibold text-slate-800">{r.period}</Td>
                    <Td right>{money(r.due)}</Td>
                    <Td right className="text-green-600 font-semibold">{money(r.collected)}</Td>
                    <Td right className={r.outstanding > 0 ? 'text-red-600 font-semibold' : ''}>
                      {money(r.outstanding)}
                    </Td>
                    <Td right>{money2(r.cash_on_hand)}</Td>
                    <Td right>{money2(r.cash_deposited)}</Td>
                    <Td right>{money2(r.cash_spent_on_expenses)}</Td>
                    <Td right>
                      {r.undeposited_count > 0 ? (
                        <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">
                          {r.undeposited_count} pending
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {openPeriod && (
        <MonthDetail period={openPeriod} onClose={() => setOpenPeriod(null)} onChanged={load} />
      )}
    </>
  );
}

// --- month drill-in ------------------------------------------------------

function MonthDetail({
  period,
  onClose,
  onChanged,
}: {
  period: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [charges, setCharges] = useState<ChargeRow[] | null>(null);
  const [expenses, setExpenses] = useState<Expense[] | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    const [c, e, w, p] = await Promise.all([
      getCharges({ period }),
      listExpenses(period),
      listWorkOrders(),
      getProperties(),
    ]);
    setCharges(c);
    setExpenses(e);
    setWorkOrders(w.filter((wo) => wo.cost && wo.completed_at && wo.completed_at.slice(0, 7) === period));
    setProperties(p);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const refresh = async () => {
    await load();
    onChanged();
  };

  if (!charges || !expenses) {
    return (
      <Modal open onClose={onClose} title={`${period} — Cash & Expenses`}>
        <Loading />
      </Modal>
    );
  }

  const cashPaid = charges.filter((c) => c.status === 'paid' && (c.method ?? '').toLowerCase() === 'cash');
  const cashCollected = cashPaid.reduce((s, c) => s + c.amount, 0);
  const cashDeposited = cashPaid.filter((c) => c.deposited).reduce((s, c) => s + c.amount, 0);
  const manualCash = expenses.filter((e) => e.paid_in_cash).reduce((s, e) => s + e.amount, 0);
  const woCash = workOrders.filter((w) => w.paid_in_cash).reduce((s, w) => s + (w.cost ?? 0), 0);
  const cashSpent = manualCash + woCash;
  const cashOnHand = cashCollected - cashDeposited - cashSpent;

  const toggle = async (c: ChargeRow) => {
    setBusy(c.id);
    try {
      await setDeposited(c.id, !c.deposited);
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal open onClose={onClose} title={`${period} — Cash & Expenses`} subtitle="Check off deposits and log expenses.">
      {/* cash split */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Mini label="Cash collected" value={money2(cashCollected)} />
        <Mini label="On hand" value={money2(cashOnHand)} tone={cashOnHand > 0 ? 'warn' : 'default'} />
        <Mini label="Deposited" value={money2(cashDeposited)} tone="good" />
        <Mini label="Spent on expenses" value={money2(cashSpent)} />
      </div>

      {/* deposit checklist */}
      <h3 className="font-bold text-slate-800 mb-2">Cash rent — check off when deposited</h3>
      {cashPaid.length === 0 ? (
        <p className="text-slate-400 text-sm mb-6">No cash rent collected this month.</p>
      ) : (
        <table className="w-full mb-6">
          <thead>
            <tr className="border-b border-slate-100">
              <Th>Tenant</Th>
              <Th>Unit</Th>
              <Th right>Amount</Th>
              <Th right>Deposited</Th>
            </tr>
          </thead>
          <tbody>
            {cashPaid.map((c) => (
              <tr key={c.id} className="border-b border-slate-50 last:border-0">
                <Td>{c.tenant_name}</Td>
                <Td>{c.unit_label ?? '—'}</Td>
                <Td right>{money2(c.amount)}</Td>
                <Td right>
                  <label className="inline-flex items-center gap-2 cursor-pointer justify-end">
                    {c.deposited && c.deposited_date && (
                      <span className="text-xs text-slate-400">{c.deposited_date}</span>
                    )}
                    <input
                      type="checkbox"
                      checked={c.deposited}
                      disabled={busy === c.id}
                      onChange={() => toggle(c)}
                      className="w-5 h-5 rounded accent-harmaal-blue cursor-pointer"
                    />
                  </label>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* expenses */}
      <ExpensesSection
        period={period}
        expenses={expenses}
        workOrders={workOrders}
        properties={properties}
        onChanged={refresh}
      />
    </Modal>
  );
}

function ExpensesSection({
  period,
  expenses,
  workOrders,
  properties,
  onChanged,
}: {
  period: string;
  expenses: Expense[];
  workOrders: WorkOrder[];
  properties: Property[];
  onChanged: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('maintenance');
  const [paidInCash, setPaidInCash] = useState(true);
  const [propertyId, setPropertyId] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = parseFloat(amount);
    if (!description.trim() || Number.isNaN(value) || value <= 0) return;
    setSaving(true);
    try {
      await createExpense({
        description: description.trim(),
        amount: value,
        category,
        period,
        spent_date: todayISO(),
        paid_in_cash: paidInCash,
        property_id: propertyId ? Number(propertyId) : null,
      });
      setDescription('');
      setAmount('');
      setPropertyId('');
      setPaidInCash(true);
      setCategory('maintenance');
      setAdding(false);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    await deleteExpense(id);
    await onChanged();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-slate-800">Expenses</h3>
        <button
          onClick={() => setAdding((v) => !v)}
          className="text-sm text-blue-600 font-semibold hover:underline"
        >
          {adding ? 'Cancel' : '+ Add expense'}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="bg-slate-50 rounded-xl p-4 mb-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Amount"
              inputMode="decimal"
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white capitalize"
            >
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white"
            >
              <option value="">All / no specific property</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.address}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={paidInCash}
                onChange={(e) => setPaidInCash(e.target.checked)}
                className="w-4 h-4 rounded accent-harmaal-blue"
              />
              Paid in cash (reduces cash on hand)
            </label>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Add expense'}
            </button>
          </div>
        </form>
      )}

      {expenses.length === 0 && workOrders.length === 0 ? (
        <p className="text-slate-400 text-sm">No expenses recorded for {period}.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100">
              <Th>Description</Th>
              <Th>Category</Th>
              <Th>Source</Th>
              <Th right>Amount</Th>
              <Th right></Th>
            </tr>
          </thead>
          <tbody>
            {expenses.map((e) => (
              <tr key={`e-${e.id}`} className="border-b border-slate-50 last:border-0">
                <Td>{e.description}</Td>
                <Td>
                  <Badge value={e.category} />
                </Td>
                <Td>
                  <span className={e.paid_in_cash ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                    {e.paid_in_cash ? 'cash' : 'bank/card'}
                  </span>
                </Td>
                <Td right>{money2(e.amount)}</Td>
                <Td right>
                  <button
                    onClick={() => remove(e.id)}
                    className="text-slate-300 hover:text-red-500 text-sm"
                    title="Delete expense"
                  >
                    ✕
                  </button>
                </Td>
              </tr>
            ))}
            {workOrders.map((w) => (
              <tr key={`w-${w.id}`} className="border-b border-slate-50 last:border-0 bg-slate-50/40">
                <Td>{w.title}</Td>
                <Td>
                  <Badge value="maintenance" />
                </Td>
                <Td>
                  <span className={w.paid_in_cash ? 'text-amber-600 font-semibold' : 'text-slate-400'}>
                    {w.paid_in_cash ? 'cash' : 'bank/card'}
                  </span>
                  <span className="text-slate-400"> · WO #{w.id}</span>
                </Td>
                <Td right className={w.paid_in_cash ? '' : 'text-slate-400'}>
                  {money2(w.cost)}
                </Td>
                <Td right>
                  <span className="text-slate-300 text-xs">auto</span>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// --- tiny presentational helpers ----------------------------------------

function Th({ children, right }: { children?: React.ReactNode; right?: boolean }) {
  return (
    <th
      className={`px-3 py-2 text-xs font-semibold text-slate-400 uppercase tracking-wide ${
        right ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  right,
  className = '',
}: {
  children: React.ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-sm text-slate-700 ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  );
}
function Mini({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  tone?: 'default' | 'good' | 'warn';
}) {
  const color = tone === 'good' ? 'text-green-600' : tone === 'warn' ? 'text-amber-600' : 'text-slate-900';
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

// re-export for optional reuse
export { downloadInvoice };
