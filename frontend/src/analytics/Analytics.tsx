import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  getCharges,
  getMonthlyFinancials,
  getProperties,
  getTenants,
  listExpenses,
  listWorkOrders,
} from '../data/api';
import type { ChargeRow, Expense, MonthlyFinancials, Property, Tenant, WorkOrder } from '../data/types';
import { Loading, PageHeader, StatCard } from '../components/ui';
import { money } from '../format';
import { useIsMobile } from '../hooks/useIsMobile';
import { isLeaseActive } from './compute';
import {
  filterCharges,
  filterExpenses,
  filterWorkOrders,
  parseFilters,
  serializeFilters,
  type FilterState,
} from './filters';
import { FilterBar } from './charts/FilterBar';
import { RevenueCharts } from './charts/RevenueCharts';
import { ProfitCharts } from './charts/ProfitCharts';
import { TenantCharts } from './charts/TenantCharts';
import { MaintenanceCharts } from './charts/MaintenanceCharts';
import { OccupancyCharts } from './charts/OccupancyCharts';

const OPEN_WO = ['open', 'assigned', 'in_progress'];

const TABS = [
  { key: 'revenue', label: 'Revenue' },
  { key: 'profit', label: 'Profitability' },
  { key: 'tenants', label: 'Tenants & Late Payers' },
  { key: 'maintenance', label: 'Maintenance' },
  { key: 'occupancy', label: 'Occupancy' },
] as const;
type TabKey = (typeof TABS)[number]['key'];

interface RawData {
  charges: ChargeRow[];
  workOrders: WorkOrder[];
  expenses: Expense[];
  properties: Property[];
  tenants: Tenant[];
  monthly: MonthlyFinancials[];
}

export default function Analytics(): ReactElement {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<RawData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [failed, setFailed] = useState<string[]>([]);
  // Hydrate filters + active tab from the URL once (shareable/bookmarkable views).
  const [filters, setFilters] = useState<FilterState>(() => parseFilters(searchParams));
  const [tab, setTab] = useState<TabKey>(() => {
    const t = searchParams.get('tab');
    return TABS.some((x) => x.key === t) ? (t as TabKey) : 'revenue';
  });

  // Mirror filters + tab back into the URL (replace: no history-stack spam).
  useEffect(() => {
    setSearchParams(serializeFilters(filters, tab), { replace: true });
  }, [filters, tab, setSearchParams]);

  useEffect(() => {
    let alive = true;
    // allSettled (not all): one flaky endpoint degrades a section, not the page.
    Promise.allSettled([
      getCharges(),
      listWorkOrders(),
      listExpenses(),
      getProperties(),
      getTenants(),
      getMonthlyFinancials(60),
    ]).then((r) => {
      if (!alive) return;
      const names = ['charges', 'work orders', 'expenses', 'properties', 'tenants', 'financials'];
      const failedNames = names.filter((_, i) => r[i].status === 'rejected');
      if (failedNames.length === names.length) {
        setError('Could not load analytics data. Please try again.');
        return;
      }
      setFailed(failedNames);
      setData({
        charges: r[0].status === 'fulfilled' ? r[0].value : [],
        workOrders: r[1].status === 'fulfilled' ? r[1].value : [],
        expenses: r[2].status === 'fulfilled' ? r[2].value : [],
        properties: r[3].status === 'fulfilled' ? r[3].value : [],
        tenants: r[4].status === 'fulfilled' ? r[4].value : [],
        monthly: r[5].status === 'fulfilled' ? r[5].value : [],
      });
    });
    return () => {
      alive = false;
    };
  }, []);

  // Point-in-time reference for occupancy: the end of the selected range, but
  // never in the future (leases extend forward). Occupancy is a snapshot, not a
  // sum, so it uses this instead of the range as a whole.
  const occupancyRef = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (filters.to >= '9999') return today;
    const [y, m] = filters.to.split('-').map(Number);
    const endOfMonth = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    return endOfMonth < today ? endOfMonth : today;
  }, [filters.to]);

  // Stage 1: filtered base datasets (the only full-array passes per filter change).
  const base = useMemo(() => {
    if (!data) return null;
    const fCharges = filterCharges(data.charges, filters, filters.propertyId);
    const fWorkOrders = filterWorkOrders(data.workOrders, filters, filters.propertyId);
    const fExpenses = filterExpenses(data.expenses, filters, filters.propertyId);
    const fMonthly = data.monthly.filter((m) => m.period >= filters.from && m.period <= filters.to);
    let scopedProperties =
      filters.propertyId === 'all'
        ? data.properties
        : data.properties.filter((p) => p.id === filters.propertyId);
    let scopedTenants =
      filters.propertyId === 'all'
        ? data.tenants
        : data.tenants.filter((t) => t.property_id === filters.propertyId);
    if (filters.tenantId !== 'all') {
      scopedTenants = scopedTenants.filter((t) => t.id === filters.tenantId);
      // Scope occupancy to the selected tenant's property so the tab and KPI
      // reflect the filter instead of showing portfolio-wide numbers.
      const selected = data.tenants.find((t) => t.id === filters.tenantId);
      if (selected) scopedProperties = scopedProperties.filter((p) => p.id === selected.property_id);
    }
    return { fCharges, fWorkOrders, fExpenses, fMonthly, scopedProperties, scopedTenants };
  }, [data, filters]);

  const kpis = useMemo(() => {
    if (!base) return null;
    const billed = base.fCharges.reduce((s, c) => s + c.amount, 0);
    const collected = base.fCharges.reduce((s, c) => s + (c.status === 'paid' ? c.amount : 0), 0);
    // Operating expenses (Expense rows) and repair-job costs (WorkOrder.cost) are
    // disjoint spend streams — a work-order cost is never also written as an
    // Expense row — so summing both is the full cost base, not a double count.
    const woCost = base.fWorkOrders.reduce((s, w) => s + (w.completed_at && w.cost ? w.cost : 0), 0);
    const expenses = base.fExpenses.reduce((s, e) => s + e.amount, 0);
    const openWO = base.fWorkOrders.filter((w) => OPEN_WO.includes(w.status)).length;
    const units = base.scopedProperties.reduce((s, p) => s + p.units, 0);
    // Point-in-time occupancy: units with a lease active at the range's end date.
    const occupied = base.scopedProperties.reduce(
      (s, p) => s + Math.min(p.tenants.filter((t) => isLeaseActive(t, occupancyRef)).length, p.units),
      0,
    );
    return {
      collected,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      netProfit: collected - expenses - woCost,
      openWO,
      occupancy: units > 0 ? Math.round((occupied / units) * 100) : null,
    };
  }, [base, occupancyRef]);

  if (error) {
    return (
      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        <PageHeader title="Analytics" />
        <div className="p-6 bg-red-50 text-red-600 rounded-2xl">{error}</div>
      </div>
    );
  }
  if (!data || !base || !kpis) {
    return (
      <div className="p-4 sm:p-8 max-w-7xl mx-auto">
        <PageHeader title="Analytics" subtitle="Insights across revenue, tenants, and maintenance." />
        <Loading label="Crunching the numbers…" />
      </div>
    );
  }

  // Drill-through: clicking a property/tenant bar sets the corresponding global
  // filter (and clears the other dimension) so every chart narrows to it.
  const selectProperty = (address: string) => {
    const p = data.properties.find((x) => x.address === address);
    if (p) setFilters((f) => ({ ...f, propertyId: p.id, tenantId: 'all' }));
  };
  const selectTenant = (name: string) => {
    const t = data.tenants.find((x) => x.name === name);
    if (t) setFilters((f) => ({ ...f, tenantId: t.id }));
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <PageHeader title="Analytics" subtitle="Insights across revenue, profitability, tenants, and maintenance." />

      <FilterBar filters={filters} onChange={setFilters} properties={data.properties} tenants={data.tenants} />

      {failed.length > 0 && (
        <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          ⚠ Some data couldn’t be loaded ({failed.join(', ')}). The affected charts may be incomplete.
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
        <StatCard label="Collected" value={money(kpis.collected)} tone="good" />
        <StatCard
          label="Collection rate"
          value={kpis.collectionRate === null ? '—' : `${kpis.collectionRate}%`}
          tone={kpis.collectionRate !== null && kpis.collectionRate >= 95 ? 'good' : 'warn'}
        />
        <StatCard
          label="Net profit"
          value={money(kpis.netProfit)}
          tone={kpis.netProfit >= 0 ? 'good' : 'bad'}
        />
        <StatCard label="Open work orders" value={kpis.openWO} tone={kpis.openWO > 0 ? 'warn' : 'default'} />
        <StatCard label="Occupancy" value={kpis.occupancy === null ? '—' : `${kpis.occupancy}%`} />
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-harmaal-blue text-white shadow-sm'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Only the active section mounts — keeps ~20 ResponsiveContainers from measuring at once. */}
      {tab === 'revenue' && (
        <RevenueCharts charges={base.fCharges} isMobile={isMobile} onSelectProperty={selectProperty} />
      )}
      {tab === 'profit' && (
        <ProfitCharts
          charges={base.fCharges}
          expenses={base.fExpenses}
          workOrders={base.fWorkOrders}
          monthly={base.fMonthly}
          isMobile={isMobile}
          onSelectProperty={selectProperty}
        />
      )}
      {tab === 'tenants' && (
        <TenantCharts
          charges={base.fCharges}
          tenants={base.scopedTenants}
          isMobile={isMobile}
          onSelectTenant={selectTenant}
        />
      )}
      {tab === 'maintenance' && <MaintenanceCharts workOrders={base.fWorkOrders} isMobile={isMobile} />}
      {tab === 'occupancy' && (
        <OccupancyCharts
          properties={base.scopedProperties}
          refDate={occupancyRef}
          isMobile={isMobile}
          onSelectProperty={selectProperty}
        />
      )}
    </div>
  );
}
