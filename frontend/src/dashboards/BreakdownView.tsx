/**
 * A reusable "breakdown" panel: slice a list of records by period (this month /
 * this year / all time) and group them by property or tenant, then drill into a
 * single group to see the underlying rows. Used by the owner and manager
 * dashboards for maintenance spend, work orders, and rent charges.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { money, TableScroll } from '../components/ui';
import { Row, Td, Th } from './tables';

export type BreakdownPeriod = 'month' | 'year' | 'all';
export type BreakdownDimension = 'property' | 'tenant';

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function currentYear(): string {
  return new Date().toISOString().slice(0, 4);
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
            value === o.value
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function BreakdownView<T>({
  rows,
  getDate,
  getAmount,
  getProperty,
  getTenant,
  renderDetail,
  amountLabel = 'Total',
  countLabel = 'Count',
  showAmount = true,
  periods = true,
  defaultPeriod = 'year',
  defaultDimension = 'property',
  emptyLabel = 'Nothing here. 🎉',
}: {
  rows: T[];
  /** ISO date string ('YYYY-MM…') used to bucket by period; undated rows drop out once a period is active. */
  getDate: (row: T) => string | null | undefined;
  getAmount: (row: T) => number;
  getProperty: (row: T) => string;
  getTenant: (row: T) => string;
  /** Render the detail table once a single group is drilled into. */
  renderDetail: (rows: T[]) => ReactNode;
  amountLabel?: string;
  countLabel?: string;
  showAmount?: boolean;
  periods?: boolean;
  defaultPeriod?: BreakdownPeriod;
  defaultDimension?: BreakdownDimension;
  emptyLabel?: string;
}) {
  const [period, setPeriod] = useState<BreakdownPeriod>(periods ? defaultPeriod : 'all');
  const [dimension, setDimension] = useState<BreakdownDimension>(defaultDimension);
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!periods || period === 'all') return rows;
    const month = currentMonth();
    const year = currentYear();
    return rows.filter((r) => {
      const d = getDate(r);
      if (!d) return false;
      return period === 'month' ? d.slice(0, 7) === month : d.slice(0, 4) === year;
    });
  }, [rows, period, periods, getDate]);

  const groups = useMemo(() => {
    const label = dimension === 'property' ? getProperty : getTenant;
    const map = new Map<string, T[]>();
    for (const r of filtered) {
      const key = label(r) || (dimension === 'property' ? '— No property' : '— No tenant');
      const arr = map.get(key);
      if (arr) arr.push(r);
      else map.set(key, [r]);
    }
    return [...map.entries()]
      .map(([name, items]) => ({
        name,
        items,
        count: items.length,
        total: items.reduce((s, r) => s + getAmount(r), 0),
      }))
      .sort((a, b) => (showAmount ? b.total - a.total : b.count - a.count));
  }, [filtered, dimension, getProperty, getTenant, getAmount, showAmount]);

  // Changing the grouping dimension invalidates the selected group name; changing
  // the period keeps the selection so the user can compare month vs. year in place.
  const changeDimension = (d: BreakdownDimension) => {
    setDimension(d);
    setSelected(null);
  };

  const grandTotal = groups.reduce((s, g) => s + g.total, 0);

  const periodOptions: { value: BreakdownPeriod; label: string }[] = [
    { value: 'month', label: 'This month' },
    { value: 'year', label: 'This year' },
    { value: 'all', label: 'All time' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        {periods && <Segmented value={period} options={periodOptions} onChange={setPeriod} />}
        <Segmented
          value={dimension}
          options={[
            { value: 'property', label: 'By property' },
            { value: 'tenant', label: 'By tenant' },
          ]}
          onChange={changeDimension}
        />
      </div>

      {selected !== null ? (
        <div>
          <button
            onClick={() => setSelected(null)}
            className="text-slate-400 hover:text-slate-700 text-sm font-semibold mb-3"
          >
            ← All {dimension === 'property' ? 'properties' : 'tenants'}
          </button>
          <h3 className="font-bold text-slate-800 mb-3">{selected}</h3>
          {renderDetail(groups.find((g) => g.name === selected)?.items ?? [])}
        </div>
      ) : groups.length === 0 ? (
        <p className="text-slate-400 text-sm">{emptyLabel}</p>
      ) : (
        <TableScroll minWidth="min-w-[420px]">
        <table className="w-full">
          <thead>
            <tr>
              <Th>{dimension === 'property' ? 'Property' : 'Tenant'}</Th>
              <Th right>{countLabel}</Th>
              {showAmount && <Th right>{amountLabel}</Th>}
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <Row key={g.name} onClick={() => setSelected(g.name)}>
                <Td>{g.name}</Td>
                <Td right>{g.count}</Td>
                {showAmount && <Td right>{money(g.total)}</Td>}
              </Row>
            ))}
          </tbody>
          {showAmount && (
            <tfoot>
              <tr className="border-t border-slate-100">
                <Td className="font-bold text-slate-700">Total</Td>
                <Td right className="font-bold text-slate-700">
                  {filtered.length}
                </Td>
                <Td right className="font-bold text-slate-700">
                  {money(grandTotal)}
                </Td>
              </tr>
            </tfoot>
          )}
        </table>
        </TableScroll>
      )}
    </div>
  );
}
