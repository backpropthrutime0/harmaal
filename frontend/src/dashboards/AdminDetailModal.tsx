import { useEffect, useMemo, useState } from 'react';
import { getCharges, getProperties, getTenants, listWorkOrders } from '../data/api';
import type { ChargeRow, Property, Tenant, WorkOrder } from '../data/types';
import { Badge, Loading, Modal, money } from '../components/ui';

/** Which admin stat card was clicked. */
export type AdminMetric =
  | 'properties'
  | 'occupancy'
  | 'tenants'
  | 'billed'
  | 'collected'
  | 'outstanding'
  | 'work_orders'
  | 'maintenance';

const OPEN_WO = ['open', 'assigned', 'in_progress'];

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}
function currentYear(): string {
  return new Date().toISOString().slice(0, 4);
}

const TITLES: Record<AdminMetric, { title: string; subtitle: string }> = {
  properties: { title: 'Properties', subtitle: 'Every property in the portfolio — click one for details.' },
  occupancy: { title: 'Occupancy', subtitle: 'Occupied vs. total units per property.' },
  tenants: { title: 'Tenants', subtitle: 'All tenants — click one for lease and payment history.' },
  billed: { title: 'Billed This Month', subtitle: `Charges billed for ${currentMonth()}.` },
  collected: { title: 'Collected This Month', subtitle: `Payments received for ${currentMonth()}.` },
  outstanding: { title: 'Outstanding', subtitle: 'All unpaid and overdue charges.' },
  work_orders: { title: 'Open Work Orders', subtitle: 'Active maintenance jobs.' },
  maintenance: { title: 'Maintenance Spend (YTD)', subtitle: `Completed work-order costs in ${currentYear()}.` },
};

// --- small table helpers -------------------------------------------------

function Th({ children, right }: { children: React.ReactNode; right?: boolean }) {
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
function Td({ children, right }: { children: React.ReactNode; right?: boolean }) {
  return <td className={`px-3 py-2 text-sm text-slate-700 ${right ? 'text-right' : ''}`}>{children}</td>;
}
function Row({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
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

function latestPayment(t: Tenant): ChargeRow['status'] | null {
  const sorted = [...t.payments].sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
  return sorted[0]?.status ?? null;
}
function balance(t: Tenant): number {
  return t.payments.filter((p) => p.status !== 'paid').reduce((s, p) => s + p.amount, 0);
}

// --- drill-down detail panels -------------------------------------------

function PropertyDetail({ property, onTenant }: { property: Property; onTenant: (t: Tenant) => void }) {
  const rentRoll = property.tenants.reduce((s, t) => s + t.rent_amount, 0);
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Mini label="Units" value={property.units} />
        <Mini label="Occupied" value={`${property.tenants.length}/${property.units}`} />
        <Mini label="Monthly rent roll" value={money(rentRoll)} />
        <Mini label="Vacancies" value={Math.max(property.units - property.tenants.length, 0)} />
      </div>
      {property.description && <p className="text-sm text-slate-500 mb-4">{property.description}</p>}
      <h3 className="font-bold text-slate-800 mb-2">Tenants</h3>
      {property.tenants.length === 0 ? (
        <p className="text-slate-400 text-sm">No tenants yet.</p>
      ) : (
        <table className="w-full">
          <thead>
            <tr>
              <Th>Tenant</Th>
              <Th>Unit</Th>
              <Th right>Rent</Th>
              <Th right>Status</Th>
            </tr>
          </thead>
          <tbody>
            {property.tenants.map((t) => (
              <Row key={t.id} onClick={() => onTenant(t)}>
                <Td>{t.name}</Td>
                <Td>{t.unit_label ?? '—'}</Td>
                <Td right>{money(t.rent_amount)}</Td>
                <Td right>{latestPayment(t) ? <Badge value={latestPayment(t)!} /> : '—'}</Td>
              </Row>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function TenantDetail({ tenant }: { tenant: Tenant }) {
  const paid = tenant.payments.filter((p) => p.status === 'paid').length;
  const owed = balance(tenant);
  const history = [...tenant.payments].sort((a, b) => (a.due_date < b.due_date ? 1 : -1));
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <Mini label="Monthly rent" value={money(tenant.rent_amount)} />
        <Mini label="Unit" value={tenant.unit_label ?? '—'} />
        <Mini label="Paid periods" value={paid} />
        <Mini label="Balance" value={money(owed)} tone={owed > 0 ? 'bad' : 'good'} />
      </div>
      <div className="text-sm text-slate-500 mb-4">
        <div>{tenant.email}</div>
        <div>
          Lease: {tenant.lease_start_date} → {tenant.lease_end_date}
        </div>
      </div>
      <h3 className="font-bold text-slate-800 mb-2">Payment history</h3>
      <table className="w-full">
        <thead>
          <tr>
            <Th>Period</Th>
            <Th>Due</Th>
            <Th right>Amount</Th>
            <Th>Method</Th>
            <Th right>Status</Th>
          </tr>
        </thead>
        <tbody>
          {history.map((p) => (
            <Row key={p.id}>
              <Td>{p.period}</Td>
              <Td>{p.due_date}</Td>
              <Td right>{money(p.amount)}</Td>
              <Td>{p.method ?? '—'}</Td>
              <Td right>
                <Badge value={p.status} />
              </Td>
            </Row>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Mini({ label, value, tone }: { label: string; value: React.ReactNode; tone?: 'good' | 'bad' }) {
  const color = tone === 'bad' ? 'text-red-600' : tone === 'good' ? 'text-green-600' : 'text-slate-900';
  return (
    <div className="bg-slate-50 rounded-xl p-3">
      <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}

function ChargeTable({ rows }: { rows: ChargeRow[] }) {
  if (rows.length === 0) return <p className="text-slate-400 text-sm">Nothing here. 🎉</p>;
  const total = rows.reduce((s, r) => s + r.amount, 0);
  return (
    <>
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
      <div className="mt-4 text-right text-sm font-bold text-slate-700">Total: {money(total)}</div>
    </>
  );
}

function WorkOrderTable({ rows, showCost }: { rows: WorkOrder[]; showCost?: boolean }) {
  if (rows.length === 0) return <p className="text-slate-400 text-sm">Nothing here. 🎉</p>;
  const total = rows.reduce((s, r) => s + (r.cost ?? 0), 0);
  return (
    <>
      <table className="w-full">
        <thead>
          <tr>
            <Th>Job</Th>
            <Th>Property</Th>
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
                <Badge value={w.priority} />
              </Td>
              <Td right>{showCost ? money(w.cost) : <Badge value={w.status} />}</Td>
            </Row>
          ))}
        </tbody>
      </table>
      {showCost && <div className="mt-4 text-right text-sm font-bold text-slate-700">Total: {money(total)}</div>}
    </>
  );
}

// --- the modal -----------------------------------------------------------

export function AdminDetailModal({ metric, onClose }: { metric: AdminMetric | null; onClose: () => void }) {
  const [properties, setProperties] = useState<Property[] | null>(null);
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [charges, setCharges] = useState<ChargeRow[] | null>(null);
  const [workOrders, setWorkOrders] = useState<WorkOrder[] | null>(null);
  const [loading, setLoading] = useState(false);

  // drill-down selection
  const [selProperty, setSelProperty] = useState<Property | null>(null);
  const [selTenant, setSelTenant] = useState<Tenant | null>(null);

  // reset drill-down whenever the metric changes
  useEffect(() => {
    setSelProperty(null);
    setSelTenant(null);
  }, [metric]);

  useEffect(() => {
    if (!metric) return;
    setLoading(true);
    const month = currentMonth();
    const year = currentYear();
    const load = async () => {
      switch (metric) {
        case 'properties':
        case 'occupancy':
          setProperties(await getProperties());
          break;
        case 'tenants':
          setTenants(await getTenants());
          break;
        case 'billed':
          setCharges(await getCharges({ period: month }));
          break;
        case 'collected':
          setCharges(await getCharges({ period: month, status: 'paid' }));
          break;
        case 'outstanding':
          setCharges((await getCharges()).filter((c) => c.status !== 'paid'));
          break;
        case 'work_orders':
          setWorkOrders((await listWorkOrders()).filter((w) => OPEN_WO.includes(w.status)));
          break;
        case 'maintenance':
          setWorkOrders(
            (await listWorkOrders()).filter(
              (w) => w.cost && w.completed_at && w.completed_at.startsWith(year),
            ),
          );
          break;
      }
    };
    load()
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [metric]);

  const header = useMemo(() => {
    if (!metric) return { title: '', subtitle: '' };
    if (selTenant) return { title: selTenant.name, subtitle: `${selTenant.unit_label ?? ''}`.trim() };
    if (selProperty) return { title: selProperty.address, subtitle: 'Property detail' };
    return TITLES[metric];
  }, [metric, selProperty, selTenant]);

  const onBack = selTenant
    ? () => setSelTenant(null)
    : selProperty
      ? () => setSelProperty(null)
      : undefined;

  const body = () => {
    if (loading) return <Loading />;
    if (selTenant) return <TenantDetail tenant={selTenant} />;
    if (selProperty)
      return <PropertyDetail property={selProperty} onTenant={(t) => setSelTenant(t)} />;

    switch (metric) {
      case 'properties':
      case 'occupancy':
        if (!properties) return <Loading />;
        return (
          <table className="w-full">
            <thead>
              <tr>
                <Th>Property</Th>
                <Th right>Units</Th>
                <Th right>Occupied</Th>
                <Th right>Occupancy</Th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <Row key={p.id} onClick={() => setSelProperty(p)}>
                  <Td>{p.address}</Td>
                  <Td right>{p.units}</Td>
                  <Td right>{p.tenants.length}</Td>
                  <Td right>{p.units ? Math.round((p.tenants.length / p.units) * 100) : 0}%</Td>
                </Row>
              ))}
            </tbody>
          </table>
        );
      case 'tenants':
        if (!tenants) return <Loading />;
        return (
          <table className="w-full">
            <thead>
              <tr>
                <Th>Tenant</Th>
                <Th>Unit</Th>
                <Th right>Rent</Th>
                <Th right>Balance</Th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((t) => (
                <Row key={t.id} onClick={() => setSelTenant(t)}>
                  <Td>{t.name}</Td>
                  <Td>{t.unit_label ?? '—'}</Td>
                  <Td right>{money(t.rent_amount)}</Td>
                  <Td right>{money(balance(t))}</Td>
                </Row>
              ))}
            </tbody>
          </table>
        );
      case 'billed':
      case 'collected':
      case 'outstanding':
        return charges ? <ChargeTable rows={charges} /> : <Loading />;
      case 'work_orders':
        return workOrders ? <WorkOrderTable rows={workOrders} /> : <Loading />;
      case 'maintenance':
        return workOrders ? <WorkOrderTable rows={workOrders} showCost /> : <Loading />;
      default:
        return null;
    }
  };

  return (
    <Modal open={metric !== null} onClose={onClose} title={header.title} subtitle={header.subtitle} onBack={onBack}>
      {body()}
    </Modal>
  );
}
