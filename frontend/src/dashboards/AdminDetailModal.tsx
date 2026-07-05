import { useEffect, useMemo, useState } from 'react';
import { getCharges, getProperties, getTenants, listWorkOrders } from '../data/api';
import type { ChargeRow, Property, Tenant, WorkOrder } from '../data/types';
import { Badge, Loading, Modal, TableScroll, money } from '../components/ui';
import { ChargeTable, Row, Td, Th, WorkOrderTable } from './tables';
import { BreakdownView } from './BreakdownView';

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

const TITLES: Record<AdminMetric, { title: string; subtitle: string }> = {
  properties: { title: 'Properties', subtitle: 'Every property in the portfolio — click one for details.' },
  occupancy: { title: 'Occupancy', subtitle: 'Occupied vs. total units per property.' },
  tenants: { title: 'Tenants', subtitle: 'All tenants — click one for lease and payment history.' },
  billed: { title: 'Billed', subtitle: 'Charges billed — broken down by property or tenant.' },
  collected: { title: 'Collected', subtitle: 'Payments received — broken down by property or tenant.' },
  outstanding: { title: 'Outstanding', subtitle: 'Unpaid and overdue charges by property or tenant.' },
  work_orders: { title: 'Open Work Orders', subtitle: 'Active maintenance jobs by property or tenant.' },
  maintenance: { title: 'Maintenance Spend', subtitle: 'Completed work-order costs by period, property, and tenant.' },
};

// --- small helpers -------------------------------------------------------

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
        <TableScroll minWidth="min-w-[480px]">
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
        </TableScroll>
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
      <TableScroll minWidth="min-w-[560px]">
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
      </TableScroll>
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
          // All charges; the breakdown's period toggle slices to month/year.
          setCharges(await getCharges());
          break;
        case 'collected':
          setCharges(await getCharges({ status: 'paid' }));
          break;
        case 'outstanding':
          setCharges((await getCharges()).filter((c) => c.status !== 'paid'));
          break;
        case 'work_orders':
          setWorkOrders((await listWorkOrders()).filter((w) => OPEN_WO.includes(w.status)));
          break;
        case 'maintenance':
          // All completed, costed work orders; period toggle handles YTD/monthly.
          setWorkOrders(
            (await listWorkOrders()).filter((w) => w.cost && w.completed_at),
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
          <TableScroll minWidth="min-w-[480px]">
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
          </TableScroll>
        );
      case 'tenants':
        if (!tenants) return <Loading />;
        return (
          <TableScroll minWidth="min-w-[480px]">
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
          </TableScroll>
        );
      case 'billed':
      case 'collected':
      case 'outstanding':
        if (!charges) return <Loading />;
        return (
          <BreakdownView
            rows={charges}
            getDate={(c) => c.period}
            getAmount={(c) => c.amount}
            getProperty={(c) => c.property_address ?? ''}
            getTenant={(c) => c.tenant_name}
            renderDetail={(rows) => <ChargeTable rows={rows} />}
            amountLabel="Amount"
            countLabel="Charges"
            defaultPeriod={metric === 'outstanding' ? 'all' : 'month'}
          />
        );
      case 'work_orders':
        if (!workOrders) return <Loading />;
        return (
          <BreakdownView
            rows={workOrders}
            getDate={(w) => w.created_at}
            getAmount={() => 0}
            getProperty={(w) => w.property_address ?? ''}
            getTenant={(w) => w.tenant_name ?? ''}
            renderDetail={(rows) => <WorkOrderTable rows={rows} />}
            countLabel="Open jobs"
            showAmount={false}
            periods={false}
          />
        );
      case 'maintenance':
        if (!workOrders) return <Loading />;
        return (
          <BreakdownView
            rows={workOrders}
            getDate={(w) => w.completed_at}
            getAmount={(w) => w.cost ?? 0}
            getProperty={(w) => w.property_address ?? ''}
            getTenant={(w) => w.tenant_name ?? ''}
            renderDetail={(rows) => <WorkOrderTable rows={rows} showCost />}
            amountLabel="Spend"
            countLabel="Jobs"
            defaultPeriod="year"
          />
        );
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
