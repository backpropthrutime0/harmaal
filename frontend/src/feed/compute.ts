/**
 * Pure presentation helpers for the feed console.
 *
 * Anything with a decision in it lives here rather than inside a component, so
 * it can be unit-tested without rendering. Business rules (FEFO, expiry
 * classification, valuation) belong to the backend — this module only shapes
 * already-computed numbers for display.
 */
import { EXPIRY_BUCKET_ORDER } from './constants';
import type { FeedBucket, FeedPeriod } from './types';

// Axis formatters are shared chart infrastructure, not feed-specific — re-exported
// from `analytics/theme` so both consoles' charts label money and months the same
// way rather than drifting apart.
export { compactMoney, shortPeriod } from '../analytics/theme';

/** Whole units with thousands separators — quantities are never fractional. */
export function units(n: number): string {
  return Math.round(n).toLocaleString();
}

/**
 * Human countdown to an expiry date.
 *
 * `null` days means the lot carries no expiry date at all, which is different
 * from "expires today" — hence the em dash rather than a zero.
 */
export function expiryCountdown(days: number | null): string {
  if (days === null) return '—';
  if (days < 0) return `${Math.abs(days)}d ago`;
  if (days === 0) return 'today';
  return `${days}d`;
}

/** Percentage of `total` that `part` represents, 0 when the total is 0. */
export function share(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 1000) / 10;
}

/**
 * Expiry buckets in a stable, meaningful order for charting.
 *
 * The API returns a keyed object; charts need an ordered array, and the order
 * must be oldest-first regardless of object key order.
 */
export function bucketSeries(
  buckets: Record<string, FeedBucket>,
): { bucket: string; units: number; value: number }[] {
  return EXPIRY_BUCKET_ORDER.map((bucket) => ({
    bucket,
    units: buckets[bucket]?.units ?? 0,
    value: buckets[bucket]?.value ?? 0,
  }));
}

/** True when every bucket/series entry is empty — drives the chart empty state. */
export function isEmptySeries(rows: { units?: number; value?: number }[]): boolean {
  return rows.every((row) => !row.units && !row.value);
}

/**
 * Month-over-month change in a period series, as a percentage of the prior month.
 *
 * Returns `null` when there is no prior month, or when the prior month was zero
 * — "up from nothing" is not a percentage, and rendering `Infinity%` is worse
 * than rendering nothing.
 */
export function momChange(rows: FeedPeriod[], key: keyof FeedPeriod): number | null {
  if (rows.length < 2) return null;
  const current = Number(rows[rows.length - 1][key]);
  const previous = Number(rows[rows.length - 2][key]);
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Total units of a period series — used for chart empty-state checks. */
export function totalSold(rows: FeedPeriod[]): number {
  return rows.reduce((sum, row) => sum + row.units_sold, 0);
}
