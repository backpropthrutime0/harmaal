/**
 * Unit tests for the pure filter/range helpers in filters.ts.
 *
 * All tests that depend on "now" inject a FIXED Date object so results are
 * deterministic regardless of when the suite runs.  Never call Date.now()
 * or new Date() without an argument in this file.
 *
 * new Date(2026, 6, 5)  →  July 5 2026 in local time (month is 0-indexed).
 * Using the Date(year, month, day) constructor avoids the UTC-midnight
 * ambiguity of the ISO-string form 'YYYY-MM-DD'.
 */
import { describe, expect, it } from 'vitest';
import type { ChargeRow, Expense, Property, Tenant, WorkOrder } from '../data/types';
import {
  filterCharges,
  filterExpenses,
  filterWorkOrders,
  initialFilters,
  parseFilters,
  propertyOptions,
  resolveRange,
  serializeFilters,
  tenantOptions,
  type FilterState,
} from './filters';

// --------------------------------------------------------------------------
// Typed fixture factories (minimal shape required by the filter functions)
// --------------------------------------------------------------------------

const prop = (over: Partial<Property>): Property => ({
  id: 1,
  address: '1 Main St',
  units: 4,
  description: null,
  owner_id: 10,
  tenants: [],
  ...over,
});

const tenant = (over: Partial<Tenant>): Tenant => ({
  id: 1,
  name: 'Amina',
  email: 'amina@example.com',
  rent_amount: 1000,
  lease_start_date: '2025-01-01',
  lease_end_date: '2026-12-31',
  unit_label: 'A-1',
  property_id: 1,
  user_id: null,
  payments: [],
  ...over,
});

const expense = (over: Partial<Expense>): Expense => ({
  id: 1,
  description: 'Repair',
  amount: 200,
  category: 'maintenance',
  period: '2026-07',
  spent_date: '2026-07-01',
  paid_in_cash: false,
  property_id: 1,
  property_address: '1 Main St',
  ...over,
});

const charge = (over: Partial<ChargeRow>): ChargeRow => ({
  id: 1,
  tenant_id: 1,
  tenant_name: 'Amina',
  unit_label: 'A-1',
  property_id: 1,
  property_address: '1 Main St',
  amount: 1000,
  period: '2026-07',
  due_date: '2026-07-05',
  paid_date: null,
  status: 'pending',
  method: null,
  deposited: false,
  deposited_date: null,
  ...over,
});

const wo = (over: Partial<WorkOrder>): WorkOrder => ({
  id: 1,
  property_id: 1,
  property_address: '1 Main St',
  tenant_id: null,
  tenant_name: null,
  unit_label: null,
  title: 'Fix pipe',
  description: '',
  category: 'plumbing',
  priority: 'medium',
  status: 'completed',
  assigned_to: null,
  assignee_name: null,
  cost: 100,
  paid_in_cash: false,
  scheduled_for: null,
  completed_at: '2026-07-01',
  created_at: '2026-06-28',
  messages: [],
  ...over,
});

/** Build a FilterState with sensible defaults that can be overridden. */
const fs = (over: Partial<FilterState> = {}): FilterState => ({
  preset: 'last_12',
  from: '2026-01',
  to: '2026-12',
  propertyId: 'all',
  tenantId: 'all',
  ...over,
});

// Fixed "now" dates injected into all time-dependent helpers.
const NOW_JUL_2026 = new Date(2026, 6, 5);   // July  5 2026
const NOW_NOV_2026 = new Date(2026, 10, 15);  // Nov  15 2026 (tests Dec→Jan rollover)
const NOW_JAN_2026 = new Date(2026, 0, 5);    // Jan   5 2026 (tests Jan boundary)

// --------------------------------------------------------------------------
// resolveRange
// --------------------------------------------------------------------------

describe('resolveRange', () => {
  it('this_month: from and to are both the current month', () => {
    expect(resolveRange('this_month', NOW_JUL_2026)).toEqual({ from: '2026-07', to: '2026-07' });
  });

  it('this_year: from is January of current year, to is December', () => {
    expect(resolveRange('this_year', NOW_JUL_2026)).toEqual({ from: '2026-01', to: '2026-12' });
  });

  it('last_12: spans exactly 12 months ending with the current month', () => {
    const { from, to } = resolveRange('last_12', NOW_JUL_2026);
    expect(to).toBe('2026-07');
    expect(from).toBe('2025-08');
  });

  it('all: returns the sentinel open range', () => {
    expect(resolveRange('all', NOW_JUL_2026)).toEqual({ from: '0000-01', to: '9999-12' });
  });

  it('custom: returns the same sentinel open range as all', () => {
    expect(resolveRange('custom', NOW_JUL_2026)).toEqual({ from: '0000-01', to: '9999-12' });
  });

  it('this_year for a January date starts at the correct year', () => {
    expect(resolveRange('this_year', NOW_JAN_2026)).toEqual({ from: '2026-01', to: '2026-12' });
  });

  // shiftMonth December → January year-boundary, exercised through last_12
  it('last_12 from a November date: range straddles Dec/Jan year boundary', () => {
    // now = Nov 2026 → from = shiftMonth('2026-11', -11) = 2025-12, to = 2026-11
    const { from, to } = resolveRange('last_12', NOW_NOV_2026);
    expect(to).toBe('2026-11');
    expect(from).toBe('2025-12');
  });

  it('last_12 from a January date: from is in the previous year', () => {
    // now = Jan 2026 → from = shiftMonth('2026-01', -11) = 2025-02, to = 2026-01
    const { from, to } = resolveRange('last_12', NOW_JAN_2026);
    expect(to).toBe('2026-01');
    expect(from).toBe('2025-02');
  });
});

// --------------------------------------------------------------------------
// initialFilters
// --------------------------------------------------------------------------

describe('initialFilters', () => {
  it('returns last_12 preset with correct bounds and all-sentinel ids', () => {
    const f = initialFilters(NOW_JUL_2026);
    expect(f.preset).toBe('last_12');
    expect(f.from).toBe('2025-08');
    expect(f.to).toBe('2026-07');
    expect(f.propertyId).toBe('all');
    expect(f.tenantId).toBe('all');
  });

  it('has all required FilterState keys', () => {
    const f = initialFilters(NOW_JUL_2026);
    expect(f).toHaveProperty('preset');
    expect(f).toHaveProperty('from');
    expect(f).toHaveProperty('to');
    expect(f).toHaveProperty('propertyId');
    expect(f).toHaveProperty('tenantId');
  });
});

// --------------------------------------------------------------------------
// propertyOptions
// --------------------------------------------------------------------------

describe('propertyOptions', () => {
  it('"All properties" is always the first entry', () => {
    const opts = propertyOptions([prop({ id: 1, address: '1 Main St' })]);
    expect(opts[0]).toEqual({ value: 'all', label: 'All properties' });
  });

  it('maps each property to {value: id, label: address}', () => {
    const opts = propertyOptions([
      prop({ id: 3, address: 'Maple Ave' }),
      prop({ id: 7, address: 'Oak Rd' }),
    ]);
    expect(opts).toHaveLength(3); // All + 2
    expect(opts[1]).toEqual({ value: 3, label: 'Maple Ave' });
    expect(opts[2]).toEqual({ value: 7, label: 'Oak Rd' });
  });

  it('preserves insertion order (does not sort properties)', () => {
    const opts = propertyOptions([
      prop({ id: 2, address: 'Zebra Lane' }),
      prop({ id: 1, address: 'Alpha St' }),
    ]);
    expect(opts[1].label).toBe('Zebra Lane');
    expect(opts[2].label).toBe('Alpha St');
  });

  it('empty properties list returns only the All entry', () => {
    const opts = propertyOptions([]);
    expect(opts).toHaveLength(1);
    expect(opts[0].value).toBe('all');
  });
});

// --------------------------------------------------------------------------
// tenantOptions
// --------------------------------------------------------------------------

describe('tenantOptions', () => {
  const tenants: Tenant[] = [
    tenant({ id: 2, name: 'Carlos', property_id: 1 }),
    tenant({ id: 3, name: 'Amina',  property_id: 1 }),
    tenant({ id: 4, name: 'Bilal',  property_id: 2 }),
  ];

  it('"All tenants" is always the first entry', () => {
    const opts = tenantOptions(tenants, 'all');
    expect(opts[0]).toEqual({ value: 'all', label: 'All tenants' });
  });

  it('with propertyId=all, all tenants are included and sorted by name', () => {
    const opts = tenantOptions(tenants, 'all');
    const names = opts.slice(1).map((o) => o.label);
    expect(names).toEqual(['Amina', 'Bilal', 'Carlos']);
  });

  it('with a specific propertyId, only matching tenants are included', () => {
    const opts = tenantOptions(tenants, 1);
    // Only Amina (id=3) and Carlos (id=2) belong to property_id=1
    expect(opts).toHaveLength(3); // All + 2
    const names = opts.slice(1).map((o) => o.label);
    expect(names).toEqual(['Amina', 'Carlos']);
  });

  it('maps tenant to {value: id, label: name}', () => {
    const opts = tenantOptions([tenant({ id: 9, name: 'Dina', property_id: 1 })], 1);
    expect(opts[1]).toEqual({ value: 9, label: 'Dina' });
  });

  it('empty tenant list returns only the All entry', () => {
    const opts = tenantOptions([], 'all');
    expect(opts).toHaveLength(1);
    expect(opts[0].value).toBe('all');
  });

  it('propertyId filter with no matching tenants returns only All entry', () => {
    const opts = tenantOptions(tenants, 99);
    expect(opts).toHaveLength(1);
    expect(opts[0].value).toBe('all');
  });
});

// --------------------------------------------------------------------------
// filterCharges
// --------------------------------------------------------------------------

describe('filterCharges', () => {
  it('includes charges whose period falls within the range', () => {
    const result = filterCharges(
      [charge({ period: '2026-07' }), charge({ period: '2026-08' })],
      fs({ from: '2026-07', to: '2026-07' }),
      'all',
    );
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2026-07');
  });

  it('excludes charges whose period is before the range', () => {
    const result = filterCharges(
      [charge({ period: '2025-12' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('excludes charges whose period is after the range', () => {
    const result = filterCharges(
      [charge({ period: '2027-01' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('includes charges on the exact from/to boundaries (inclusive)', () => {
    const result = filterCharges(
      [charge({ period: '2026-01' }), charge({ period: '2026-12' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('filters by property_id when a specific property is selected', () => {
    const result = filterCharges(
      [
        charge({ property_id: 1, property_address: '1 Main St' }),
        charge({ property_id: 2, property_address: '2 Oak Ave' }),
      ],
      fs({ from: '2026-01', to: '2026-12' }),
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].property_id).toBe(1);
  });

  it('does not match a different property even if addresses collide', () => {
    // Two properties sharing an address must NOT cross-contaminate — id wins.
    const result = filterCharges(
      [
        charge({ property_id: 1, property_address: 'Shared Address' }),
        charge({ property_id: 2, property_address: 'Shared Address' }),
      ],
      fs({ from: '2026-01', to: '2026-12' }),
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].property_id).toBe(1);
  });

  it('propertyId=all passes all properties through', () => {
    const result = filterCharges(
      [charge({ property_id: 1 }), charge({ property_id: 2 })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('filters by tenantId when a specific tenant is selected', () => {
    const result = filterCharges(
      [charge({ tenant_id: 1 }), charge({ tenant_id: 2 })],
      fs({ from: '2026-01', to: '2026-12', tenantId: 1 }),
      'all',
    );
    expect(result).toHaveLength(1);
    expect(result[0].tenant_id).toBe(1);
  });

  it('returns [] for empty charges', () => {
    expect(filterCharges([], fs(), 'all')).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// filterWorkOrders
// --------------------------------------------------------------------------

describe('filterWorkOrders', () => {
  it('uses completed_at to determine the period when present', () => {
    // completed_at = '2026-07-01' → period '2026-07', in range
    const result = filterWorkOrders(
      [wo({ completed_at: '2026-07-01', created_at: '2026-05-01' })],
      fs({ from: '2026-07', to: '2026-07' }),
      'all',
    );
    expect(result).toHaveLength(1);
  });

  it('falls back to created_at when completed_at is null', () => {
    // completed_at=null, created_at='2026-07-15' → period '2026-07'
    const result = filterWorkOrders(
      [wo({ completed_at: null, created_at: '2026-07-15', status: 'open' })],
      fs({ from: '2026-07', to: '2026-07' }),
      'all',
    );
    expect(result).toHaveLength(1);
  });

  it('completed_at in range while created_at out of range: uses completed_at', () => {
    // completed_at = 2026-08 (out of range), created_at = 2026-07 (in range)
    // Filter 2026-07 to 2026-07: should be excluded because completed_at wins
    const result = filterWorkOrders(
      [wo({ completed_at: '2026-08-01', created_at: '2026-07-01' })],
      fs({ from: '2026-07', to: '2026-07' }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('excludes WOs whose date period is outside the range', () => {
    const result = filterWorkOrders(
      [wo({ completed_at: '2025-12-01' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('filters by propertyId', () => {
    const result = filterWorkOrders(
      [wo({ property_id: 1 }), wo({ property_id: 2 })],
      fs({ from: '2026-01', to: '2026-12' }),
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].property_id).toBe(1);
  });

  it('propertyId=all passes all properties', () => {
    const result = filterWorkOrders(
      [wo({ property_id: 1 }), wo({ property_id: 3 })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('filters by tenantId when a specific tenant is selected', () => {
    const result = filterWorkOrders(
      [wo({ tenant_id: 5 }), wo({ tenant_id: 6 })],
      fs({ from: '2026-01', to: '2026-12', tenantId: 5 }),
      'all',
    );
    expect(result).toHaveLength(1);
    expect(result[0].tenant_id).toBe(5);
  });

  it('WO with null tenant_id is excluded when a specific tenant filter is active', () => {
    const result = filterWorkOrders(
      [wo({ tenant_id: null })],
      fs({ from: '2026-01', to: '2026-12', tenantId: 5 }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('WO with null tenant_id is included when tenantId=all', () => {
    const result = filterWorkOrders(
      [wo({ tenant_id: null })],
      fs({ from: '2026-01', to: '2026-12', tenantId: 'all' }),
      'all',
    );
    expect(result).toHaveLength(1);
  });

  it('returns [] for empty work orders', () => {
    expect(filterWorkOrders([], fs(), 'all')).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// filterExpenses
// --------------------------------------------------------------------------

describe('filterExpenses', () => {
  it('includes expenses whose period is within range', () => {
    const result = filterExpenses(
      [expense({ period: '2026-07' }), expense({ period: '2026-08' })],
      fs({ from: '2026-07', to: '2026-07' }),
      'all',
    );
    expect(result).toHaveLength(1);
    expect(result[0].period).toBe('2026-07');
  });

  it('excludes expenses outside the range', () => {
    const result = filterExpenses(
      [expense({ period: '2025-01' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(0);
  });

  it('includes expenses on the exact from/to boundaries', () => {
    const result = filterExpenses(
      [expense({ period: '2026-01' }), expense({ period: '2026-12' })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('filters by propertyId', () => {
    const result = filterExpenses(
      [expense({ property_id: 1 }), expense({ property_id: 2 })],
      fs({ from: '2026-01', to: '2026-12' }),
      1,
    );
    expect(result).toHaveLength(1);
    expect(result[0].property_id).toBe(1);
  });

  it('propertyId=all passes all expenses', () => {
    const result = filterExpenses(
      [expense({ property_id: 1 }), expense({ property_id: 4 })],
      fs({ from: '2026-01', to: '2026-12' }),
      'all',
    );
    expect(result).toHaveLength(2);
  });

  it('returns [] for empty expenses', () => {
    expect(filterExpenses([], fs(), 'all')).toHaveLength(0);
  });
});

// --------------------------------------------------------------------------
// serializeFilters / parseFilters (URL round-trip)
// --------------------------------------------------------------------------

describe('serializeFilters / parseFilters', () => {
  it('omits default (all) property/tenant and non-custom range', () => {
    const p = serializeFilters(fs({ preset: 'last_12', propertyId: 'all', tenantId: 'all' }), 'revenue');
    expect(p).toEqual({ tab: 'revenue', preset: 'last_12' });
  });

  it('includes prop, tenant, and custom range when set', () => {
    const p = serializeFilters(
      fs({ preset: 'custom', from: '2024-01', to: '2024-06', propertyId: 3, tenantId: 7 }),
      'maintenance',
    );
    expect(p).toEqual({
      tab: 'maintenance',
      preset: 'custom',
      from: '2024-01',
      to: '2024-06',
      prop: '3',
      tenant: '7',
    });
  });

  it('round-trips a custom range with ids', () => {
    const original = fs({ preset: 'custom', from: '2024-01', to: '2024-06', propertyId: 3, tenantId: 7 });
    const params = new URLSearchParams(serializeFilters(original, 'tenants'));
    const parsed = parseFilters(params, NOW_JUL_2026);
    expect(parsed).toEqual(original);
  });

  it('re-derives a relative preset from `now` (not stored bounds)', () => {
    const params = new URLSearchParams({ preset: 'this_month' });
    expect(parseFilters(params, NOW_JUL_2026)).toEqual({
      preset: 'this_month',
      from: '2026-07',
      to: '2026-07',
      propertyId: 'all',
      tenantId: 'all',
    });
  });

  it('falls back to last_12 / all for missing or invalid params', () => {
    const parsed = parseFilters(new URLSearchParams({ preset: 'bogus', prop: 'x', tenant: '' }), NOW_JUL_2026);
    expect(parsed.preset).toBe('last_12');
    expect(parsed.propertyId).toBe('all');
    expect(parsed.tenantId).toBe('all');
    expect(parsed.from).toBe('2025-08');
    expect(parsed.to).toBe('2026-07');
  });
});
