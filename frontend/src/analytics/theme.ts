/**
 * Chart color constants and shared recharts styling. Colors are literal hex —
 * SVG `fill`/`stroke` props can't read Tailwind classes — but they mirror the
 * `harmaal-*` `@theme` tokens declared in `src/index.css`.
 */

export const HARMAAL = {
  blue: '#2a5c82',
  gold: '#c5a059',
  earth: '#a67c52',
  sand: '#fdfbf7',
} as const;

/** Slate/green/amber/red — kept in sync with the `Badge` tones in ui.tsx. */
export const STATUS_COLORS: Record<string, string> = {
  paid: '#16a34a',
  pending: '#d97706',
  overdue: '#dc2626',
  completed: '#16a34a',
  in_progress: '#d97706',
  assigned: '#2563eb',
  open: '#64748b',
  cancelled: '#94a3b8',
};

export const PRIORITY_COLORS: Record<string, string> = {
  low: '#64748b',
  medium: '#2563eb',
  high: '#d97706',
  emergency: '#dc2626',
};

/** Expense / work-order category palette (stable, distinct hues). */
export const CATEGORY_COLORS: Record<string, string> = {
  maintenance: '#2a5c82',
  utilities: '#0891b2',
  insurance: '#7c3aed',
  taxes: '#dc2626',
  management: '#c5a059',
  general: '#64748b',
  plumbing: '#2563eb',
  electrical: '#d97706',
  hvac: '#0891b2',
  appliance: '#7c3aed',
  structural: '#a67c52',
};

/** Ordered categorical palette for series that don't map to a known key. */
export const PALETTE = [
  '#2a5c82',
  '#c5a059',
  '#16a34a',
  '#0891b2',
  '#7c3aed',
  '#dc2626',
  '#a67c52',
  '#d97706',
  '#2563eb',
  '#64748b',
] as const;

/** Deterministic color for a named slice: known key → its color, else palette by index. */
export function colorFor(name: string, index: number, lookup?: Record<string, string>): string {
  return lookup?.[name] ?? PALETTE[index % PALETTE.length];
}

/** Shared axis/grid styling so every chart looks consistent. */
export const AXIS_TICK = { fontSize: 11, fill: '#64748b' } as const;
export const GRID_STROKE = '#e2e8f0';

/** `1234567 → "$1.2M"`, `48210 → "$48.2k"` — compact money for dense axes/labels. */
export function compactMoney(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}

/** `'2026-07' → "Jul '26"` for compact month axes. */
export function shortPeriod(period: string): string {
  const [y, m] = period.split('-');
  if (!y || !m) return period;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const idx = Number(m) - 1;
  return `${months[idx] ?? m} '${y.slice(2)}`;
}
