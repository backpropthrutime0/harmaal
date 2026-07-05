/**
 * Global filter state for the Analytics page and the pure helpers that resolve
 * a date preset into concrete month bounds and thread the filters into the raw
 * datasets. Month keys are `'YYYY-MM'`; string comparison is a valid ordering.
 */
import type { ChargeRow, Expense, Property, Tenant, WorkOrder } from '../data/types';
import { periodOf } from './compute';

export type DatePreset = 'this_month' | 'this_year' | 'last_12' | 'all' | 'custom';

export interface FilterState {
  preset: DatePreset;
  from: string; // 'YYYY-MM' inclusive
  to: string; // 'YYYY-MM' inclusive
  propertyId: number | 'all';
  tenantId: number | 'all';
}

/** Shift a `'YYYY-MM'` key by `delta` months (can be negative). */
function shiftMonth(period: string, delta: number): string {
  const [y, m] = period.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  // Euclidean modulo so month index stays 0..11 even if `total` is negative.
  const nm = (((total % 12) + 12) % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

/** Resolve a preset to concrete inclusive `{from,to}` month bounds against `now`. */
export function resolveRange(preset: DatePreset, now: Date = new Date()): { from: string; to: string } {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const current = `${year}-${month}`;
  switch (preset) {
    case 'this_month':
      return { from: current, to: current };
    case 'this_year':
      return { from: `${year}-01`, to: `${year}-12` };
    case 'last_12':
      return { from: shiftMonth(current, -11), to: current };
    case 'all':
    case 'custom':
    default:
      return { from: '0000-01', to: '9999-12' };
  }
}

/** Build the initial filter state (defaults to the last 12 months, all properties/tenants). */
export function initialFilters(now: Date = new Date()): FilterState {
  const { from, to } = resolveRange('last_12', now);
  return { preset: 'last_12', from, to, propertyId: 'all', tenantId: 'all' };
}

export interface DropdownOption {
  value: number | 'all';
  label: string;
}

/** Property dropdown options (id → address), with an "All properties" entry first. */
export function propertyOptions(properties: Property[]): DropdownOption[] {
  return [
    { value: 'all', label: 'All properties' },
    ...properties.map((p) => ({ value: p.id, label: p.address })),
  ];
}

/**
 * Tenant dropdown options, narrowed to the selected property when one is chosen.
 * "All tenants" is always the first entry.
 */
export function tenantOptions(tenants: Tenant[], propertyId: number | 'all'): DropdownOption[] {
  const scoped = propertyId === 'all' ? tenants : tenants.filter((t) => t.property_id === propertyId);
  return [
    { value: 'all', label: 'All tenants' },
    ...scoped
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((t) => ({ value: t.id, label: t.name })),
  ];
}

const inRange = (period: string, f: FilterState) => period >= f.from && period <= f.to;

/**
 * Charges within the date range and matching the property/tenant selection.
 * Matches on `property_id` (stable key) like work orders and expenses — not on
 * the address string — so a duplicate/blank address can't skew the filter.
 */
export function filterCharges(charges: ChargeRow[], f: FilterState, propertyId: number | 'all'): ChargeRow[] {
  return charges.filter(
    (c) =>
      inRange(c.period, f) &&
      (propertyId === 'all' || c.property_id === propertyId) &&
      (f.tenantId === 'all' || c.tenant_id === f.tenantId),
  );
}

/**
 * Work orders matching the selection. Date filtering uses `completed_at` when
 * present (so spend/throughput land in the month work finished), else
 * `created_at`. Tenant filtering keeps WOs with no tenant only when no tenant
 * is selected.
 */
export function filterWorkOrders(workOrders: WorkOrder[], f: FilterState, propertyId: number | 'all'): WorkOrder[] {
  return workOrders.filter((w) => {
    const period = periodOf(w.completed_at ?? w.created_at);
    return (
      inRange(period, f) &&
      (propertyId === 'all' || w.property_id === propertyId) &&
      (f.tenantId === 'all' || w.tenant_id === f.tenantId)
    );
  });
}

/** Expenses within the range and property (expenses have no tenant dimension). */
export function filterExpenses(expenses: Expense[], f: FilterState, propertyId: number | 'all'): Expense[] {
  return expenses.filter(
    (e) => inRange(e.period, f) && (propertyId === 'all' || e.property_id === propertyId),
  );
}
