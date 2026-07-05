/**
 * Pure, framework-free statistics and aggregation helpers for the Analytics
 * module. Everything here is deterministic and unit-testable — no React, no
 * data fetching. Charts derive their row arrays from these functions.
 */
import type { ChargeRow, WorkOrder } from '../data/types';

// --------------------------------------------------------------------------
// Period & date helpers
// --------------------------------------------------------------------------

/** `'2026-07-05...'` → `'2026-07'` month key. Returns '' for empty input. */
export function periodOf(dateISO: string | null | undefined): string {
  if (!dateISO) return '';
  return dateISO.slice(0, 7);
}

/**
 * Whole days from `a` → `b` (i.e. `b - a`); negative when `b` precedes `a`.
 * Parses the leading `YYYY-MM-DD` as UTC midnight so results are timezone-safe
 * and unaffected by the host clock.
 */
export function daysBetween(aISO: string | null | undefined, bISO: string | null | undefined): number {
  if (!aISO || !bISO) return 0;
  const a = Date.parse(`${aISO.slice(0, 10)}T00:00:00Z`);
  const b = Date.parse(`${bISO.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

// --------------------------------------------------------------------------
// Generic aggregation
// --------------------------------------------------------------------------

/** Group rows into a Map keyed by `key(row)`, preserving first-seen order. */
export function groupBy<T, K extends string | number>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const out = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const bucket = out.get(k);
    if (bucket) bucket.push(r);
    else out.set(k, [r]);
  }
  return out;
}

/** Sum `amount(row)` grouped by `date(row)`'s month → `[{period,total}]` sorted ascending by period. */
export function sumByPeriod<T>(
  rows: T[],
  getDate: (r: T) => string | null | undefined,
  getAmount: (r: T) => number,
): { period: string; total: number }[] {
  const totals = new Map<string, number>();
  for (const r of rows) {
    const p = periodOf(getDate(r));
    if (!p) continue;
    totals.set(p, (totals.get(p) ?? 0) + getAmount(r));
  }
  return [...totals.entries()]
    .map(([period, total]) => ({ period, total }))
    .sort((a, b) => (a.period < b.period ? -1 : a.period > b.period ? 1 : 0));
}

/** Count occurrences of `key(row)` → `[{name,value}]` sorted by value desc. */
export function countBy<T>(rows: T[], key: (r: T) => string): { name: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

/** Sum `amount(row)` grouped by `key(row)` → `[{name,value}]` sorted by value desc. */
export function sumBy<T>(
  rows: T[],
  key: (r: T) => string,
  amount: (r: T) => number,
): { name: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    const k = key(r);
    sums.set(k, (sums.get(k) ?? 0) + amount(r));
  }
  return [...sums.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value);
}

// --------------------------------------------------------------------------
// Distributions: histogram + kernel density estimate
// --------------------------------------------------------------------------

export interface HistogramBin {
  binLabel: string;
  count: number;
  x0: number;
  x1: number;
}

/**
 * Equal-width histogram over `[min, max]`. Returns `[]` for empty input.
 * `binCount` is clamped to `>= 1`. When all values are equal the range is
 * widened by ±0.5 so the value still lands in a (central) bin.
 */
export function histogram(values: number[], binCount: number): HistogramBin[] {
  if (values.length === 0) return [];
  const n = Math.max(1, Math.floor(binCount));
  let min = Math.min(...values);
  let max = Math.max(...values);
  if (min === max) {
    // Degenerate spread — one bin around the single value.
    min -= 0.5;
    max += 0.5;
  }
  const width = (max - min) / n;
  const bins: HistogramBin[] = Array.from({ length: n }, (_, i) => {
    const x0 = min + i * width;
    const x1 = i === n - 1 ? max : x0 + width;
    return { x0, x1, count: 0, binLabel: formatBinLabel(x0, x1) };
  });
  for (const v of values) {
    // Last bin is closed on the right so `max` lands in it.
    let idx = Math.floor((v - min) / width);
    if (idx >= n) idx = n - 1;
    if (idx < 0) idx = 0;
    bins[idx].count += 1;
  }
  return bins;
}

function formatBinLabel(x0: number, x1: number): string {
  // Pick decimal precision from the bin width so narrow ranges (e.g. days-late
  // clustered in a few units across 15 bins) don't render duplicate labels.
  const span = x1 - x0;
  const digits = span >= 1 ? 0 : span >= 0.1 ? 1 : 2;
  const fmt = (n: number) => {
    const s = n.toFixed(digits);
    return s === `-${(0).toFixed(digits)}` ? (0).toFixed(digits) : s; // avoid "-0"
  };
  const a = fmt(x0);
  const b = fmt(x1);
  return a === b ? a : `${a}–${b}`;
}

export interface DensityPoint {
  x: number;
  density: number;
}

/**
 * Silverman's rule-of-thumb bandwidth: `1.06 · σ · n^(-1/5)`, falling back to an
 * IQR-based estimate (and finally a small constant) when the standard deviation
 * is zero. Exported for tests.
 */
export function silvermanBandwidth(values: number[]): number {
  const n = values.length;
  if (n < 2) return 1;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1);
  const sd = Math.sqrt(variance);
  if (sd > 0) return 1.06 * sd * n ** (-1 / 5);
  // All-equal (or near) values: try IQR, else a tiny positive bandwidth.
  const sorted = [...values].sort((a, b) => a - b);
  const iqr = quantile(sorted, 0.75) - quantile(sorted, 0.25);
  if (iqr > 0) return 0.9 * (iqr / 1.34) * n ** (-1 / 5);
  return 0.5;
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  const next = sorted[base + 1];
  return next !== undefined ? sorted[base] + rest * (next - sorted[base]) : sorted[base];
}

/**
 * Gaussian kernel density estimate. Produces `gridPoints` evenly-spaced points
 * spanning `[min - 3h, max + 3h]`. Returns `[]` for empty input; a single point
 * yields a narrow bump. No external (d3) dependency.
 */
export function kde(values: number[], gridPoints = 64, bandwidth?: number): DensityPoint[] {
  const n = values.length;
  if (n === 0) return [];
  const h = bandwidth && bandwidth > 0 ? bandwidth : silvermanBandwidth(values);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const lo = min - 3 * h;
  const hi = max + 3 * h;
  const span = hi - lo || 1;
  const step = span / Math.max(1, gridPoints - 1);
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  const points: DensityPoint[] = [];
  for (let i = 0; i < gridPoints; i++) {
    const x = lo + i * step;
    let sum = 0;
    for (const xi of values) {
      const u = (x - xi) / h;
      sum += Math.exp(-0.5 * u * u);
    }
    points.push({ x, density: norm * sum });
  }
  return points;
}

// --------------------------------------------------------------------------
// Domain: rent lateness
// --------------------------------------------------------------------------

export interface LateInfo {
  daysLate: number;
  onTime: boolean;
}

/**
 * Classify a charge's payment timing. `daysLate = paid_date − due_date`.
 * On-time means paid on or before the due date (`daysLate <= 0`). Returns
 * `null` for charges that were never paid (no `paid_date`).
 */
export function classifyLate(
  charge: Pick<ChargeRow, 'due_date' | 'paid_date'>,
): LateInfo | null {
  if (!charge.paid_date) return null;
  const daysLate = daysBetween(charge.due_date, charge.paid_date);
  return { daysLate, onTime: daysLate <= 0 };
}

export interface TenantLateStat {
  tenantId: number;
  tenantName: string;
  paidCount: number;
  lateCount: number;
  onTimeCount: number;
  avgDaysLate: number;
  maxDaysLate: number;
  overdueBalance: number;
}

/**
 * Per-tenant payment-punctuality summary, sorted by late count (worst first).
 * `avgDaysLate` averages only the late payments (`daysLate > 0`); tenants with
 * no late payments report `0`. `overdueBalance` sums amounts of still-overdue
 * charges.
 */
export function tenantLateStats(charges: ChargeRow[]): TenantLateStat[] {
  const byTenant = groupBy(charges, (c) => c.tenant_id);
  const out: TenantLateStat[] = [];
  for (const [tenantId, rows] of byTenant) {
    let paidCount = 0;
    let lateCount = 0;
    let onTimeCount = 0;
    let lateDaysSum = 0;
    let maxDaysLate = 0;
    let overdueBalance = 0;
    for (const c of rows) {
      if (c.status === 'overdue') overdueBalance += c.amount;
      const info = classifyLate(c);
      if (!info) continue;
      paidCount += 1;
      if (info.onTime) {
        onTimeCount += 1;
      } else {
        lateCount += 1;
        lateDaysSum += info.daysLate;
        if (info.daysLate > maxDaysLate) maxDaysLate = info.daysLate;
      }
    }
    out.push({
      tenantId,
      tenantName: rows[0]?.tenant_name ?? `Tenant ${tenantId}`,
      paidCount,
      lateCount,
      onTimeCount,
      avgDaysLate: lateCount > 0 ? lateDaysSum / lateCount : 0,
      maxDaysLate,
      overdueBalance,
    });
  }
  return out.sort((a, b) => b.lateCount - a.lateCount || b.avgDaysLate - a.avgDaysLate);
}

// --------------------------------------------------------------------------
// Domain: maintenance staff performance
// --------------------------------------------------------------------------

export interface StaffOnTimeStat {
  staff: string;
  completed: number;
  onTime: number;
  late: number;
  scheduledCount: number;
  onTimeRate: number | null; // null when no completed WO carried a schedule
  avgDaysToComplete: number | null;
}

/**
 * Per-assignee maintenance performance over completed work orders, sorted by
 * completion count (most productive first). A completed WO is "on-time" when it
 * has a `scheduled_for` target and `completed_at <= scheduled_for`; WOs without
 * a schedule are excluded from the on-time numerator/denominator (but still
 * counted in `completed`). `avgDaysToComplete` uses `created_at → completed_at`.
 */
export function perStaffOnTime(workOrders: WorkOrder[]): StaffOnTimeStat[] {
  const completedWOs = workOrders.filter((w) => w.status === 'completed' && w.completed_at);
  const byStaff = groupBy(completedWOs, (w) => w.assignee_name ?? 'Unassigned');
  const out: StaffOnTimeStat[] = [];
  for (const [staff, rows] of byStaff) {
    let onTime = 0;
    let late = 0;
    let scheduledCount = 0;
    let cycleSum = 0;
    let cycleCount = 0;
    for (const w of rows) {
      if (w.scheduled_for && w.completed_at) {
        scheduledCount += 1;
        if (daysBetween(w.completed_at, w.scheduled_for) >= 0) onTime += 1;
        else late += 1;
      }
      if (w.created_at && w.completed_at) {
        cycleSum += daysBetween(w.created_at, w.completed_at);
        cycleCount += 1;
      }
    }
    out.push({
      staff,
      completed: rows.length,
      onTime,
      late,
      scheduledCount,
      onTimeRate: scheduledCount > 0 ? onTime / scheduledCount : null,
      avgDaysToComplete: cycleCount > 0 ? cycleSum / cycleCount : null,
    });
  }
  return out.sort((a, b) => b.completed - a.completed);
}
