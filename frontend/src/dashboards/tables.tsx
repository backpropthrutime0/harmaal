/** Shared table primitives for dashboard detail views (owner modal + manager). */
import type { ReactNode } from 'react';
import type { ChargeRow, WorkOrder } from '../data/types';
import { Badge, money, TableScroll } from '../components/ui';

export function Th({ children, right }: { children?: ReactNode; right?: boolean }) {
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

export function Td({
  children,
  right,
  className = '',
}: {
  children: ReactNode;
  right?: boolean;
  className?: string;
}) {
  return (
    <td className={`px-3 py-2 text-sm text-slate-700 ${right ? 'text-right' : ''} ${className}`}>
      {children}
    </td>
  );
}

export function Row({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      className={`border-b border-slate-50 last:border-0 ${
        onClick ? 'cursor-pointer hover:bg-slate-50' : ''
      }`}
    >
      {children}
    </tr>
  );
}

export function ChargeTable({ rows }: { rows: ChargeRow[] }) {
  if (rows.length === 0) return <p className="text-slate-400 text-sm">Nothing here. 🎉</p>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
      <TableScroll minWidth="min-w-[560px]">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>Unit · Property</Th>
              <Th>Period</Th>
              <Th right>Amount</Th>
              <Th right>Status</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Row key={r.id}>
                <Td>{r.tenant_name}</Td>
                <Td>
                  {(r.unit_label ?? '—') + ' · '}
                  <span className="text-slate-400">{r.property_address}</span>
                </Td>
                <Td>{r.period}</Td>
                <Td right>{money(r.amount)}</Td>
                <Td right>
                  <Badge value={r.status} />
                </Td>
              </Row>
            ))}
          </tbody>
        </table>
      </TableScroll>
      <div className="mt-4 text-right text-sm font-bold text-slate-700">Total: {money(total)}</div>
    </>
  );
}

export function WorkOrderTable({ rows, showCost }: { rows: WorkOrder[]; showCost?: boolean }) {
  if (rows.length === 0) return <p className="text-slate-400 text-sm">Nothing here. 🎉</p>;
  const total = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <>
      <TableScroll minWidth="min-w-[560px]">
        <table className="w-full">
          <thead>
            <tr>
              <Th>Job</Th>
              <Th>Property</Th>
              <Th>Tenant</Th>
              <Th>Priority</Th>
              <Th right>{showCost ? 'Cost' : 'Status'}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((w) => (
              <Row key={w.id}>
                <Td>{w.title}</Td>
                <Td>
                  <span className="text-slate-400">{w.property_address}</span>
                </Td>
                <Td>
                  <span className="text-slate-400">{w.tenant_name ?? '—'}</span>
                </Td>
                <Td>
                  <Badge value={w.priority} />
                </Td>
                <Td right>{showCost ? money(w.cost) : <Badge value={w.status} />}</Td>
              </Row>
            ))}
          </tbody>
        </table>
      </TableScroll>
      {showCost && (
        <div className="mt-4 text-right text-sm font-bold text-slate-700">Total: {money(total)}</div>
      )}
    </>
  );
}
