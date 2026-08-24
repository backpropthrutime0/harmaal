/**
 * Hormaal Animal Feed — API types.
 *
 * Mirrors the Pydantic response models in `services/api/src/api/models/schemas.py`
 * (the "Hormaal Animal Feed" section). Keep the two in step: the backend is the
 * source of truth, these are the client's view of it.
 */

/** Livestock lines. Mirrors `feed_inventory.SPECIES`. */
export type Species = 'camel' | 'cattle' | 'goat' | 'chicken';

/** Physical form of the feed. Mirrors `feed_inventory.FEED_TYPES`. */
export type FeedType =
  | 'pellet'
  | 'mash'
  | 'crumble'
  | 'concentrate'
  | 'mineral'
  | 'forage'
  | 'other';

export type UnitOfMeasure = 'kg' | 'g' | 'lb' | 'l' | 'ml' | 'tonne';

export type PackageType = 'bag' | 'sack' | 'bale' | 'drum' | 'bucket' | 'box';

/** Ledger movement kinds. `receipt` is booked by the batch endpoint, not directly. */
export type MovementType = 'receipt' | 'sale' | 'adjustment' | 'write_off' | 'return';

export type StockStatus = 'healthy' | 'low' | 'out_of_stock';

export type ExpiryStatus = 'fresh' | 'expiring_soon' | 'expired';

export interface FeedProduct {
  id: number;
  sku: string;
  name: string;
  species: Species;
  feed_type: FeedType;
  brand: string | null;
  unit_size: number;
  unit_of_measure: UnitOfMeasure;
  package_type: PackageType;
  /** Human name for one sellable unit, e.g. "50 kg bag". */
  unit_label: string;
  unit_cost: number;
  unit_price: number;
  shelf_life_days: number;
  reorder_level: number;
  is_active: boolean;
  notes: string | null;
  // --- derived server-side ---
  /** Every unit physically on the shelf, expired lots included. */
  on_hand: number;
  /** What could actually be sold today. This drives `stock_status`. */
  sellable_units: number;
  stock_status: StockStatus;
  stock_value_cost: number;
  stock_value_retail: number;
  margin_per_unit: number;
  margin_pct: number;
  batch_count: number;
  nearest_expiry: string | null;
  days_to_nearest_expiry: number | null;
  expiring_units: number;
  expired_units: number;
}

export interface FeedBatch {
  id: number;
  product_id: number;
  product_sku: string | null;
  product_name: string | null;
  batch_code: string;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  value_at_cost: number;
  received_date: string;
  manufactured_date: string | null;
  expiry_date: string | null;
  days_to_expiry: number | null;
  expiry_status: ExpiryStatus;
  supplier: string | null;
  reference: string | null;
  notes: string | null;
}

export interface FeedMovement {
  id: number;
  product_id: number;
  product_sku: string | null;
  product_name: string | null;
  batch_id: number | null;
  batch_code: string | null;
  movement_type: MovementType;
  /** Signed: positive adds stock, negative removes it. */
  quantity: number;
  unit_cost: number | null;
  unit_price: number | null;
  line_cost: number;
  line_revenue: number;
  reference: string | null;
  note: string | null;
  occurred_on: string;
  created_at: string;
}

/** One request can fan out across several lots under FEFO allocation. */
export interface FeedMovementResult {
  movements: FeedMovement[];
  total_quantity: number;
  on_hand: number;
}

export interface FeedPeriod {
  period: string;
  units_in: number;
  units_sold: number;
  units_written_off: number;
  revenue: number;
  cogs: number;
  margin: number;
}

export interface FeedBucket {
  units: number;
  value: number;
}

export interface FeedNamedTotal {
  name: string;
  units: number;
  value: number;
}

export interface FeedAlert {
  product_id: number;
  sku: string;
  name: string;
  species: Species;
  batch_id: number | null;
  batch_code: string | null;
  units: number;
  value: number;
  expiry_date: string | null;
  days_to_expiry: number | null;
  reorder_level: number | null;
}

export interface FeedProductDetail {
  product: FeedProduct;
  batches: FeedBatch[];
  movements: FeedMovement[];
  monthly: FeedPeriod[];
  expiry_buckets: Record<string, FeedBucket>;
  units_sold_90d: number;
  revenue_90d: number;
  cogs_90d: number;
  margin_90d: number;
  sell_through_pct: number;
  days_of_cover: number | null;
}

export interface FeedDashboard {
  total_products: number;
  active_products: number;
  total_units: number;
  stock_value_cost: number;
  stock_value_retail: number;
  potential_margin: number;
  potential_margin_pct: number;
  low_stock_count: number;
  out_of_stock_count: number;
  expiring_soon_count: number;
  expired_count: number;
  expiring_units: number;
  expiring_value: number;
  expired_units: number;
  expired_value: number;
  expiring_value_pct: number;
  expired_value_pct: number;
  period: string;
  units_sold_mtd: number;
  revenue_mtd: number;
  cogs_mtd: number;
  margin_mtd: number;
  write_off_value_mtd: number;
  by_species: FeedNamedTotal[];
  by_stock_status: FeedNamedTotal[];
  expiry_buckets: Record<string, FeedBucket>;
  monthly: FeedPeriod[];
  top_sellers: FeedNamedTotal[];
  low_stock: FeedAlert[];
  expiring: FeedAlert[];
  expired: FeedAlert[];
}

// --- request payloads ---

export interface FeedProductInput {
  sku: string;
  name: string;
  species: Species;
  feed_type: FeedType;
  brand?: string | null;
  unit_size: number;
  unit_of_measure: UnitOfMeasure;
  package_type: PackageType;
  unit_cost: number;
  unit_price: number;
  shelf_life_days: number;
  reorder_level: number;
  notes?: string | null;
}

/** PATCH payload — every field optional; `sku` is immutable once issued. */
export type FeedProductPatch = Partial<Omit<FeedProductInput, 'sku'>> & { is_active?: boolean };

export interface FeedBatchInput {
  product_id: number;
  batch_code: string;
  quantity: number;
  unit_cost: number;
  received_date?: string | null;
  manufactured_date?: string | null;
  /** Omit to let the server derive it from the product's shelf life. */
  expiry_date?: string | null;
  supplier?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface FeedMovementInput {
  product_id: number;
  movement_type: Exclude<MovementType, 'receipt'>;
  /** Positive magnitude, except for `adjustment` where the sign is meaningful. */
  quantity: number;
  batch_id?: number | null;
  unit_price?: number | null;
  reference?: string | null;
  note?: string | null;
  occurred_on?: string | null;
}
