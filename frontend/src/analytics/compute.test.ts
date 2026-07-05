import { describe, expect, it } from 'vitest';
import type { ChargeRow, WorkOrder } from '../data/types';
import {
  classifyLate,
  countBy,
  daysBetween,
  groupBy,
  histogram,
  isLeaseActive,
  kde,
  perStaffOnTime,
  periodOf,
  silvermanBandwidth,
  sumBy,
  sumByPeriod,
  tenantLateStats,
} from './compute';

const charge = (over: Partial<ChargeRow>): ChargeRow => ({
  id: 1,
  tenant_id: 1,
  tenant_name: 'Amina',
  unit_label: 'A-1',
  property_address: '1 Main St',
  amount: 500,
  period: '2026-01',
  due_date: '2026-01-05',
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
  title: 'Fix sink',
  description: '',
  category: 'plumbing',
  priority: 'medium',
  status: 'completed',
  assigned_to: 9,
  assignee_name: 'Isaaq',
  cost: 120,
  paid_in_cash: false,
  scheduled_for: '2026-01-10',
  completed_at: '2026-01-09',
  created_at: '2026-01-02',
  messages: [],
  ...over,
});

describe('periodOf / daysBetween', () => {
  it('extracts YYYY-MM', () => {
    expect(periodOf('2026-07-05T12:00:00')).toBe('2026-07');
    expect(periodOf('')).toBe('');
    expect(periodOf(null)).toBe('');
  });
  it('counts whole days, timezone-safe and signed', () => {
    expect(daysBetween('2026-01-05', '2026-01-10')).toBe(5);
    expect(daysBetween('2026-01-10', '2026-01-05')).toBe(-5);
    expect(daysBetween('2026-01-05', '2026-01-05')).toBe(0);
    expect(daysBetween(null, '2026-01-05')).toBe(0);
  });
});

describe('sumByPeriod / countBy', () => {
  it('sums amounts per month, sorted ascending', () => {
    const rows = [
      charge({ period: '2026-02', paid_date: '2026-02-01', amount: 100 }),
      charge({ period: '2026-01', amount: 200 }),
      charge({ period: '2026-01', amount: 50 }),
    ];
    expect(sumByPeriod(rows, (c) => c.due_date.slice(0, 7) + '-01', () => 0)).toBeDefined();
    const byPeriod = sumByPeriod(rows, (c) => `${c.period}-01`, (c) => c.amount);
    expect(byPeriod).toEqual([
      { period: '2026-01', total: 250 },
      { period: '2026-02', total: 100 },
    ]);
  });
  it('counts categories desc', () => {
    const rows = [charge({ status: 'paid' }), charge({ status: 'paid' }), charge({ status: 'overdue' })];
    expect(countBy(rows, (c) => c.status)).toEqual([
      { name: 'paid', value: 2 },
      { name: 'overdue', value: 1 },
    ]);
  });
});

describe('histogram', () => {
  it('returns [] for empty input', () => {
    expect(histogram([], 5)).toEqual([]);
  });
  it('bins values and totals to the count', () => {
    const bins = histogram([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(11);
    // max value must land in the last (right-closed) bin
    expect(bins[bins.length - 1].count).toBeGreaterThan(0);
  });
  it('handles all-equal values with a single centered bin', () => {
    const bins = histogram([7, 7, 7], 4);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(3);
  });
});

describe('kde', () => {
  it('returns [] for empty input', () => {
    expect(kde([])).toEqual([]);
  });
  it('produces a valid density that integrates to ~1', () => {
    const values = Array.from({ length: 200 }, (_, i) => Math.sin(i) * 5 + 10);
    const pts = kde(values, 128);
    expect(pts).toHaveLength(128);
    // Trapezoidal integration of the density should be close to 1.
    let area = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      area += ((pts[i].density + pts[i - 1].density) / 2) * dx;
    }
    expect(area).toBeGreaterThan(0.9);
    expect(area).toBeLessThan(1.1);
    expect(pts.every((p) => p.density >= 0)).toBe(true);
  });
  it('silverman bandwidth is positive even for degenerate input', () => {
    expect(silvermanBandwidth([5, 5, 5])).toBeGreaterThan(0);
    expect(silvermanBandwidth([1])).toBeGreaterThan(0);
  });
});

describe('classifyLate / tenantLateStats', () => {
  it('classifies on-time, late, and unpaid', () => {
    expect(classifyLate(charge({ paid_date: null }))).toBeNull();
    expect(classifyLate(charge({ due_date: '2026-01-05', paid_date: '2026-01-05' }))).toEqual({
      daysLate: 0,
      onTime: true,
    });
    expect(classifyLate(charge({ due_date: '2026-01-05', paid_date: '2026-01-12' }))).toEqual({
      daysLate: 7,
      onTime: false,
    });
  });
  it('aggregates per-tenant punctuality and overdue balance', () => {
    const rows = [
      charge({ tenant_id: 1, tenant_name: 'Amina', due_date: '2026-01-05', paid_date: '2026-01-20' }),
      charge({ tenant_id: 1, tenant_name: 'Amina', due_date: '2026-02-05', paid_date: '2026-02-05' }),
      charge({ tenant_id: 1, tenant_name: 'Amina', status: 'overdue', amount: 500, paid_date: null }),
      charge({ tenant_id: 2, tenant_name: 'Bilal', due_date: '2026-01-05', paid_date: '2026-01-06' }),
    ];
    const stats = tenantLateStats(rows);
    const amina = stats.find((s) => s.tenantId === 1)!;
    expect(amina.lateCount).toBe(1);
    expect(amina.onTimeCount).toBe(1);
    expect(amina.avgDaysLate).toBe(15);
    expect(amina.overdueBalance).toBe(500);
    // sorted worst-first → Amina (1 late) before Bilal (1 late, smaller avg)
    expect(stats[0].tenantId).toBe(1);
  });
});

describe('perStaffOnTime', () => {
  it('computes completion + on-time rate + cycle time per assignee', () => {
    const orders = [
      wo({ assignee_name: 'Isaaq', scheduled_for: '2026-01-10', completed_at: '2026-01-09', created_at: '2026-01-02' }),
      wo({ assignee_name: 'Isaaq', scheduled_for: '2026-01-10', completed_at: '2026-01-15', created_at: '2026-01-05' }),
      wo({ assignee_name: 'Isaaq', scheduled_for: null, completed_at: '2026-01-20', created_at: '2026-01-18' }),
      wo({ assignee_name: 'Layla', scheduled_for: '2026-01-10', completed_at: '2026-01-08', created_at: '2026-01-01' }),
      wo({ assignee_name: 'Layla', status: 'open', completed_at: null }),
    ];
    const stats = perStaffOnTime(orders);
    const isaaq = stats.find((s) => s.staff === 'Isaaq')!;
    expect(isaaq.completed).toBe(3);
    expect(isaaq.scheduledCount).toBe(2);
    expect(isaaq.onTime).toBe(1);
    expect(isaaq.late).toBe(1);
    expect(isaaq.onTimeRate).toBeCloseTo(0.5);
    // open WO excluded from completed
    const layla = stats.find((s) => s.staff === 'Layla')!;
    expect(layla.completed).toBe(1);
    // sorted by completed desc
    expect(stats[0].staff).toBe('Isaaq');
  });
});

// --------------------------------------------------------------------------
// Extended edge-case coverage
// --------------------------------------------------------------------------

describe('histogram edge cases', () => {
  it('single value: produces requested bin count with total count 1', () => {
    const bins = histogram([7], 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(1);
  });

  it('binCount=0 is clamped to 1 bin containing all values', () => {
    const bins = histogram([1, 2, 3], 0);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(3);
  });

  it('binCount=1 places every value in a single bin', () => {
    const bins = histogram([10, 20, 30, 40, 50], 1);
    expect(bins).toHaveLength(1);
    expect(bins[0].count).toBe(5);
  });

  it('negative values are binned without error and total equals input length', () => {
    const bins = histogram([-10, -5, 0, 5, 10], 4);
    expect(bins).toHaveLength(4);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5);
    expect(bins[0].x0).toBeCloseTo(-10);
  });

  it('value exactly equal to max lands in the last (right-closed) bin', () => {
    // min=0, max=10, binCount=5 → width=2 → bins [0,2),[2,4),[4,6),[6,8),[8,10]
    // value 10: idx = floor(10/2) = 5, clamped to 4 (last bin)
    const bins = histogram([0, 2, 4, 6, 8, 10], 5);
    expect(bins).toHaveLength(5);
    expect(bins[4].count).toBeGreaterThan(0);
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(6);
  });

  it('value equal to a mid-bin boundary lands in the bin starting at that boundary', () => {
    // [0,4,8] with binCount=4 → width=2 → bins [0,2),[2,4),[4,6),[6,8]
    // value 4: idx = floor(4/2) = 2 → bin 2 [4,6)
    const bins = histogram([0, 4, 8], 4);
    expect(bins[2].count).toBe(1); // value 4 is in bin [4,6)
  });
});

describe('kde edge cases', () => {
  it('single-value input produces the requested number of finite non-negative density points', () => {
    const pts = kde([42], 16);
    expect(pts).toHaveLength(16);
    expect(pts.every((p) => Number.isFinite(p.density))).toBe(true);
    expect(pts.every((p) => p.density >= 0)).toBe(true);
    expect(pts.every((p) => !Number.isNaN(p.density))).toBe(true);
  });

  it('all-equal values produce no NaN or negative densities', () => {
    const pts = kde([5, 5, 5, 5, 5], 32);
    expect(pts).toHaveLength(32);
    expect(pts.every((p) => !Number.isNaN(p.density))).toBe(true);
    expect(pts.every((p) => p.density >= 0)).toBe(true);
    expect(pts.every((p) => Number.isFinite(p.density))).toBe(true);
  });
});

describe('silvermanBandwidth edge cases', () => {
  it('empty array (n=0) returns 1', () => {
    expect(silvermanBandwidth([])).toBe(1);
  });

  it('n=1 returns 1', () => {
    expect(silvermanBandwidth([99])).toBe(1);
  });

  it('sd=0 (all-equal values) falls back to a finite positive constant', () => {
    const bw = silvermanBandwidth([3, 3, 3, 3, 3]);
    expect(bw).toBeGreaterThan(0);
    expect(Number.isFinite(bw)).toBe(true);
  });
});

describe('daysBetween edge cases', () => {
  it('time components beyond YYYY-MM-DD are stripped so only the date matters', () => {
    // 'T00:00:00' vs 'T23:59:59' on the same calendar date → 0
    expect(daysBetween('2026-07-05T00:00:00', '2026-07-05T23:59:59')).toBe(0);
    // Full ISO with offset chars still sliced at 10
    expect(daysBetween('2026-07-05T23:59:59', '2026-07-10T00:00:01')).toBe(5);
  });

  it('malformed date strings return 0', () => {
    expect(daysBetween('not-a-date', '2026-01-05')).toBe(0);
    expect(daysBetween('2026-01-05', 'bad')).toBe(0);
    expect(daysBetween('bad', 'worse')).toBe(0);
  });

  it('undefined args return 0', () => {
    expect(daysBetween(undefined, '2026-01-05')).toBe(0);
    expect(daysBetween('2026-01-05', undefined)).toBe(0);
  });
});

describe('tenantLateStats edge cases', () => {
  it('tenant with only on-time payments: lateCount=0, avgDaysLate=0 (no divide-by-zero)', () => {
    const rows = [
      charge({ tenant_id: 5, tenant_name: 'Carlos', due_date: '2026-01-05', paid_date: '2026-01-04' }),
      charge({ tenant_id: 5, tenant_name: 'Carlos', due_date: '2026-02-05', paid_date: '2026-02-05' }),
    ];
    const stats = tenantLateStats(rows);
    expect(stats).toHaveLength(1);
    const [carlos] = stats;
    expect(carlos.lateCount).toBe(0);
    expect(carlos.onTimeCount).toBe(2);
    expect(carlos.avgDaysLate).toBe(0);
    expect(Number.isFinite(carlos.avgDaysLate)).toBe(true);
  });

  it('tenant with only unpaid charges: paidCount=0, overdueBalance accumulates', () => {
    const rows = [
      charge({ tenant_id: 6, tenant_name: 'Dina', paid_date: null, status: 'overdue', amount: 750 }),
      charge({ tenant_id: 6, tenant_name: 'Dina', paid_date: null, status: 'overdue', amount: 250 }),
    ];
    const stats = tenantLateStats(rows);
    expect(stats).toHaveLength(1);
    const [dina] = stats;
    expect(dina.paidCount).toBe(0);
    expect(dina.lateCount).toBe(0);
    expect(dina.avgDaysLate).toBe(0);
    expect(dina.overdueBalance).toBe(1000);
  });

  it('multiple tenants sorted worst-first by lateCount then avgDaysLate', () => {
    const rows = [
      // Tenant 7: 1 late by 5 days
      charge({ tenant_id: 7, tenant_name: 'Eve', due_date: '2026-01-05', paid_date: '2026-01-10' }),
      // Tenant 8: 2 late by 3 days each
      charge({ tenant_id: 8, tenant_name: 'Frank', due_date: '2026-01-05', paid_date: '2026-01-08' }),
      charge({ tenant_id: 8, tenant_name: 'Frank', due_date: '2026-02-05', paid_date: '2026-02-08' }),
    ];
    const stats = tenantLateStats(rows);
    // Frank (2 late) should come before Eve (1 late)
    expect(stats[0].tenantName).toBe('Frank');
    expect(stats[1].tenantName).toBe('Eve');
  });
});

describe('perStaffOnTime edge cases', () => {
  it('null assignee_name is grouped under "Unassigned"', () => {
    const orders = [
      wo({ assignee_name: null, completed_at: '2026-01-09', created_at: '2026-01-02' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats).toHaveLength(1);
    expect(stats[0].staff).toBe('Unassigned');
    expect(stats[0].completed).toBe(1);
  });

  it('completed === scheduled boundary: counts as on-time (daysLate=0)', () => {
    const orders = [
      wo({ assignee_name: 'Elan', scheduled_for: '2026-01-10', completed_at: '2026-01-10', created_at: '2026-01-02' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats[0].onTime).toBe(1);
    expect(stats[0].late).toBe(0);
    expect(stats[0].onTimeRate).toBe(1);
  });

  it('completed one day after schedule: counts as late', () => {
    const orders = [
      wo({ assignee_name: 'Fara', scheduled_for: '2026-01-10', completed_at: '2026-01-11', created_at: '2026-01-02' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats[0].onTime).toBe(0);
    expect(stats[0].late).toBe(1);
    expect(stats[0].onTimeRate).toBe(0);
  });

  it('WO without scheduled_for: scheduledCount=0, onTimeRate=null', () => {
    const orders = [
      wo({ assignee_name: 'Gabi', scheduled_for: null, completed_at: '2026-01-09', created_at: '2026-01-02' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats[0].scheduledCount).toBe(0);
    expect(stats[0].onTimeRate).toBeNull();
    expect(stats[0].completed).toBe(1);
  });

  it('avgDaysToComplete is null when created_at is absent for every completed WO', () => {
    const orders = [
      wo({ assignee_name: 'Hani', created_at: '', completed_at: '2026-01-09' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats[0].avgDaysToComplete).toBeNull();
  });

  it('open work orders are fully excluded from the output', () => {
    const orders = [
      wo({ assignee_name: 'Ida', status: 'open', completed_at: null }),
      wo({ assignee_name: 'Ida', status: 'in_progress', completed_at: null }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats).toHaveLength(0);
  });

  it('sorted by completed count desc', () => {
    const orders = [
      wo({ assignee_name: 'Jay', completed_at: '2026-01-09', created_at: '2026-01-02' }),
      wo({ assignee_name: 'Kim', completed_at: '2026-01-09', created_at: '2026-01-02' }),
      wo({ assignee_name: 'Kim', completed_at: '2026-01-10', created_at: '2026-01-03' }),
    ];
    const stats = perStaffOnTime(orders);
    expect(stats[0].staff).toBe('Kim');
    expect(stats[0].completed).toBe(2);
    expect(stats[1].staff).toBe('Jay');
  });
});

describe('sumBy / groupBy', () => {
  it('sumBy groups by key and sums amounts, sorted desc by value', () => {
    const data = [
      { cat: 'plumbing', cost: 100 },
      { cat: 'electrical', cost: 200 },
      { cat: 'plumbing', cost: 150 },
    ];
    const result = sumBy(data, (d) => d.cat, (d) => d.cost);
    expect(result).toEqual([
      { name: 'plumbing', value: 250 },
      { name: 'electrical', value: 200 },
    ]);
  });

  it('sumBy returns [] for empty input', () => {
    expect(sumBy([] as ChargeRow[], (c) => c.status, (c) => c.amount)).toEqual([]);
  });

  it('groupBy preserves first-seen insertion order for keys', () => {
    const data = [
      { k: 'b', v: 1 },
      { k: 'a', v: 2 },
      { k: 'b', v: 3 },
      { k: 'a', v: 4 },
    ];
    const map = groupBy(data, (d) => d.k);
    expect([...map.keys()]).toEqual(['b', 'a']);
    expect(map.get('b')).toHaveLength(2);
    expect(map.get('a')).toHaveLength(2);
  });

  it('groupBy returns an empty Map for empty input', () => {
    const map = groupBy([] as WorkOrder[], (w) => w.property_id);
    expect(map.size).toBe(0);
  });

  it('sumByPeriod returns [] for empty input', () => {
    expect(sumByPeriod([] as ChargeRow[], (c) => c.due_date, (c) => c.amount)).toEqual([]);
  });

  it('countBy returns [] for empty input', () => {
    expect(countBy([] as ChargeRow[], (c) => c.status)).toEqual([]);
  });

  it('sumByPeriod skips rows where getDate returns null', () => {
    const rows = [
      charge({ due_date: '2026-01-05', amount: 100 }),
      charge({ due_date: '2026-02-05', amount: 200 }),
    ];
    // Using getDate that returns null for all rows
    const result = sumByPeriod(rows, () => null, (c) => c.amount);
    expect(result).toEqual([]);
  });
});

describe('isLeaseActive', () => {
  const lease = { lease_start_date: '2025-01-01', lease_end_date: '2026-12-31' };
  it('true within the lease window (inclusive bounds)', () => {
    expect(isLeaseActive(lease, '2025-06-15')).toBe(true);
    expect(isLeaseActive(lease, '2025-01-01')).toBe(true);
    expect(isLeaseActive(lease, '2026-12-31')).toBe(true);
  });
  it('false before start or after end', () => {
    expect(isLeaseActive(lease, '2024-12-31')).toBe(false);
    expect(isLeaseActive(lease, '2027-01-01')).toBe(false);
  });
});
