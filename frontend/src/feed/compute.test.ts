import { describe, expect, it } from 'vitest';
import {
  bucketSeries,
  compactMoney,
  expiryCountdown,
  isEmptySeries,
  momChange,
  periodRange,
  share,
  shortPeriod,
  totalSold,
  units,
} from './compute';
import type { FeedPeriod } from './types';

const period = (over: Partial<FeedPeriod>): FeedPeriod => ({
  period: '2026-01',
  units_in: 0,
  units_sold: 0,
  units_written_off: 0,
  revenue: 0,
  cogs: 0,
  margin: 0,
  ...over,
});

describe('compactMoney', () => {
  it('abbreviates thousands and millions', () => {
    expect(compactMoney(950)).toBe('$950');
    expect(compactMoney(48210)).toBe('$48.2k');
    expect(compactMoney(1_234_567)).toBe('$1.2M');
  });

  it('keeps the sign on negatives', () => {
    expect(compactMoney(-2500)).toBe('$-2.5k');
    expect(compactMoney(0)).toBe('$0');
  });
});

describe('shortPeriod', () => {
  it('formats a YYYY-MM period', () => {
    expect(shortPeriod('2026-07')).toBe("Jul '26");
    expect(shortPeriod('2026-01')).toBe("Jan '26");
    expect(shortPeriod('2026-12')).toBe("Dec '26");
  });

  it('passes through anything it cannot parse', () => {
    expect(shortPeriod('nonsense')).toBe('nonsense');
    expect(shortPeriod('')).toBe('');
  });
});

describe('units', () => {
  it('renders whole packages', () => {
    expect(units(1234)).toBe('1,234');
    expect(units(0)).toBe('0');
    expect(units(-4)).toBe('-4');
  });
});

describe('expiryCountdown', () => {
  it('distinguishes no-expiry from expires-today', () => {
    // A lot with no expiry date is not the same as one expiring today, so it
    // must not render as "0d".
    expect(expiryCountdown(null)).toBe('—');
    expect(expiryCountdown(0)).toBe('today');
  });

  it('counts forwards and backwards', () => {
    expect(expiryCountdown(12)).toBe('12d');
    expect(expiryCountdown(-3)).toBe('3d ago');
  });
});

describe('share', () => {
  it('computes a one-decimal percentage', () => {
    expect(share(25, 200)).toBe(12.5);
    expect(share(1, 3)).toBe(33.3);
  });

  it('is zero rather than NaN when the total is zero', () => {
    expect(share(5, 0)).toBe(0);
    expect(share(0, 0)).toBe(0);
  });
});

describe('bucketSeries', () => {
  it('returns every bucket in oldest-first order, even when empty', () => {
    const rows = bucketSeries({ '0-30': { units: 5, value: 50 } });
    expect(rows.map((r) => r.bucket)).toEqual(['expired', '0-30', '31-60', '61-90', '90+']);
    expect(rows[1]).toEqual({ bucket: '0-30', units: 5, value: 50 });
    expect(rows[0]).toEqual({ bucket: 'expired', units: 0, value: 0 });
  });

  it('ignores keys the chart does not chart', () => {
    const rows = bucketSeries({ surprise: { units: 9, value: 9 } });
    expect(rows.every((r) => r.units === 0)).toBe(true);
  });
});

describe('isEmptySeries', () => {
  it('detects an all-zero series', () => {
    expect(isEmptySeries([{ units: 0, value: 0 }])).toBe(true);
    expect(isEmptySeries([])).toBe(true);
    expect(isEmptySeries([{ units: 0, value: 3 }])).toBe(false);
    expect(isEmptySeries([{ units: 2, value: 0 }])).toBe(false);
  });
});

describe('momChange', () => {
  it('compares the last two months', () => {
    const rows = [period({ units_sold: 100 }), period({ units_sold: 125 })];
    expect(momChange(rows, 'units_sold')).toBe(25);
  });

  it('handles a decline', () => {
    const rows = [period({ revenue: 200 }), period({ revenue: 150 })];
    expect(momChange(rows, 'revenue')).toBe(-25);
  });

  it('is unknown without a comparable prior month', () => {
    // "Up from zero" is not a percentage — rendering Infinity% would be worse
    // than rendering nothing.
    expect(momChange([period({ units_sold: 10 })], 'units_sold')).toBeNull();
    expect(momChange([period({ units_sold: 0 }), period({ units_sold: 10 })], 'units_sold')).toBeNull();
    expect(momChange([], 'units_sold')).toBeNull();
  });
});

describe('totalSold', () => {
  it('sums units across the window', () => {
    expect(totalSold([period({ units_sold: 3 }), period({ units_sold: 4 })])).toBe(7);
    expect(totalSold([])).toBe(0);
  });
});

describe('periodRange', () => {
  it('spans the whole month', () => {
    expect(periodRange('2026-01')).toEqual({ from: '2026-01-01', to: '2026-01-31' });
    expect(periodRange('2026-04')).toEqual({ from: '2026-04-01', to: '2026-04-30' });
  });

  it('gets February right, including leap years', () => {
    expect(periodRange('2026-02').to).toBe('2026-02-28');
    expect(periodRange('2028-02').to).toBe('2028-02-29');
  });

  it('produces an empty window for anything unparseable', () => {
    // A bad window must not silently become "all time" — the drill-down would
    // then show records the chart never counted.
    expect(periodRange('nonsense')).toEqual({ from: '', to: '' });
    expect(periodRange('2026-13')).toEqual({ from: '', to: '' });
    expect(periodRange('')).toEqual({ from: '', to: '' });
  });
});
