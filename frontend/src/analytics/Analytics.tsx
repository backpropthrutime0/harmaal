import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import {
  getCharges,
  getMonthlyFinancials,
  getProperties,
  getTenants,
  listExpenses,
  listWorkOrders,
} from '../data/api';
import type { ChargeRow, Expense, MonthlyFinancials, Property, Tenant, WorkOrder } from '../data/types';
import { Loading, money, PageHeader, StatCard } from '../components/ui';
import { useIsMobile } from '../hooks/useIsMobile';
import {
  filterCharges,
  filterExpenses,
  filterWorkOrders,
  initialFilters,
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
  const [data, setData] = useState<RawData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<FilterState>(() => initialFilters());
  const [tab, setTab] = useState<TabKey>('revenue');

  useEffect(() => {
    let alive = true;
    Promise.all([
      getCharges(),
      listWorkOrders(),
      listExpenses(),
      getProperties(),
      getTenants(),
      getMonthlyFinancials(60),
    ])
      .then(([charges, workOrders, expenses, properties, tenants, monthly]) => {
        if (alive) setData({ charges, workOrders, expenses, properties, tenants, monthly });
      })
      .catch(() => {
        if (alive) setError('Could not load analytics data. Please try again.');
      });
    return () => {
      alive = false;
    };
  }, []);

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
    const woCost = base.fWorkOrders.reduce((s, w) => s + (w.completed_at && w.cost ? w.cost : 0), 0);
    const expenses = base.fExpenses.reduce((s, e) => s + e.amount, 0);
    const openWO = base.fWorkOrders.filter((w) => OPEN_WO.includes(w.status)).length;
    const units = base.scopedProperties.reduce((s, p) => s + p.units, 0);
    const occupied = base.scopedProperties.reduce((s, p) => s + Math.min(p.tenants.length, p.units), 0);
    return {
      collected,
      collectionRate: billed > 0 ? Math.round((collected / billed) * 100) : null,
      netProfit: collected - expenses - woCost,
      openWO,
      occupancy: units > 0 ? Math.round((occupied / units) * 100) : null,
    };
  }, [base]);

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

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <PageHeader title="Analytics" subtitle="Insights across revenue, profitability, tenants, and maintenance." />

      <FilterBar filters={filters} onChange={setFilters} properties={data.properties} tenants={data.tenants} />

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
      {tab === 'revenue' && <RevenueCharts charges={base.fCharges} isMobile={isMobile} />}
      {tab === 'profit' && (
        <ProfitCharts
          charges={base.fCharges}
          expenses={base.fExpenses}
          workOrders={base.fWorkOrders}
          monthly={base.fMonthly}
          isMobile={isMobile}
        />
      )}
      {tab === 'tenants' && (
        <TenantCharts charges={base.fCharges} tenants={base.scopedTenants} isMobile={isMobile} />
      )}
      {tab === 'maintenance' && <MaintenanceCharts workOrders={base.fWorkOrders} isMobile={isMobile} />}
      {tab === 'occupancy' && <OccupancyCharts properties={base.scopedProperties} isMobile={isMobile} />}
    </div>
  );
}
