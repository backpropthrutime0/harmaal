/**
 * Display vocabularies for the feed console.
 *
 * The source of truth is `services/api/src/api/internal/feed_inventory.py`; these
 * are the human labels and the colour tones for the same values. If a vocabulary
 * grows on the backend, extend the union in `types.ts` and add its label here.
 */
import type {
  ExpiryStatus,
  FeedType,
  MovementType,
  PackageType,
  Species,
  StockStatus,
  UnitOfMeasure,
} from './types';

export const SPECIES: Species[] = ['camel', 'cattle', 'goat', 'chicken'];

export const SPECIES_LABEL: Record<Species, string> = {
  camel: 'Camel',
  cattle: 'Cattle',
  goat: 'Goat & sheep',
  chicken: 'Poultry',
};

export const SPECIES_ICON: Record<Species, string> = {
  camel: '🐫',
  cattle: '🐄',
  goat: '🐐',
  chicken: '🐔',
};

export const FEED_TYPES: FeedType[] = [
  'pellet',
  'mash',
  'crumble',
  'concentrate',
  'mineral',
  'forage',
  'other',
];

export const UNITS_OF_MEASURE: UnitOfMeasure[] = ['kg', 'g', 'lb', 'l', 'ml', 'tonne'];

export const PACKAGE_TYPES: PackageType[] = ['bag', 'sack', 'bale', 'drum', 'bucket', 'box'];

/** Movement kinds an operator can book directly (`receipt` comes from receiving). */
export const OPERATOR_MOVEMENTS: Exclude<MovementType, 'receipt'>[] = [
  'sale',
  'write_off',
  'return',
  'adjustment',
];

export const MOVEMENT_LABEL: Record<MovementType, string> = {
  receipt: 'Received',
  sale: 'Sale',
  adjustment: 'Adjustment',
  write_off: 'Write-off',
  return: 'Return',
};

export const MOVEMENT_HINT: Record<Exclude<MovementType, 'receipt'>, string> = {
  sale: 'Sold to a customer. Drawn nearest-expiry-first; expired lots are excluded.',
  write_off: 'Damaged, spoiled or past expiry. Drawn nearest-expiry-first.',
  return: 'A customer returned saleable stock. Pick the lot it came from.',
  adjustment: 'Stock-count correction. Negative removes, positive adds to a named lot.',
};

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  healthy: 'In stock',
  low: 'Low stock',
  out_of_stock: 'Out of stock',
};

export const EXPIRY_STATUS_LABEL: Record<ExpiryStatus, string> = {
  fresh: 'Fresh',
  expiring_soon: 'Expiring soon',
  expired: 'Expired',
};

/** Tailwind pill classes, matching the tone language of the property app's Badge. */
export const STOCK_STATUS_TONE: Record<StockStatus, string> = {
  healthy: 'bg-green-100 text-green-700',
  low: 'bg-amber-100 text-amber-700',
  out_of_stock: 'bg-red-100 text-red-700',
};

export const EXPIRY_STATUS_TONE: Record<ExpiryStatus, string> = {
  fresh: 'bg-green-100 text-green-700',
  expiring_soon: 'bg-amber-100 text-amber-700',
  expired: 'bg-red-100 text-red-700',
};

export const MOVEMENT_TONE: Record<MovementType, string> = {
  receipt: 'bg-blue-100 text-blue-700',
  sale: 'bg-green-100 text-green-700',
  return: 'bg-slate-100 text-slate-600',
  adjustment: 'bg-violet-100 text-violet-700',
  write_off: 'bg-red-100 text-red-700',
};

/**
 * Chart palette. Literal hex because SVG `fill`/`stroke` cannot read Tailwind
 * classes — same constraint (and same approach) as `analytics/theme.ts`.
 * The feed brand runs green/amber to separate it from the property app's blue.
 */
export const FEED_COLORS = {
  green: '#3f7d3f',
  leaf: '#6aa84f',
  amber: '#d97706',
  gold: '#f0b429',
  clay: '#a67c52',
  slate: '#64748b',
  red: '#dc2626',
  blue: '#2a5c82',
} as const;

export const SPECIES_COLOR: Record<Species, string> = {
  camel: '#a67c52',
  cattle: '#3f7d3f',
  goat: '#6aa84f',
  chicken: '#d97706',
};

export const EXPIRY_BUCKET_COLOR: Record<string, string> = {
  expired: '#dc2626',
  '0-30': '#d97706',
  '31-60': '#f0b429',
  '61-90': '#6aa84f',
  '90+': '#3f7d3f',
};

/** Ordered so the expiry chart always reads oldest → freshest, left to right. */
export const EXPIRY_BUCKET_ORDER = ['expired', '0-30', '31-60', '61-90', '90+'] as const;
