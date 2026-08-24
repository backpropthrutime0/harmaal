/** Hormaal Animal Feed — HTTP helpers on the shared axios instance. */
import api from '../api';
import type {
  ExpiryStatus,
  FeedBatch,
  FeedBatchInput,
  FeedDashboard,
  FeedMovement,
  FeedMovementInput,
  FeedMovementResult,
  FeedProduct,
  FeedProductDetail,
  FeedProductInput,
  FeedProductPatch,
  MovementType,
  Species,
} from './types';

export interface ProductFilters {
  species?: Species | '';
  /**
   * One `StockStatus`, or a comma-separated set the API treats as "any of these"
   * — `"low,out_of_stock"` is the "needs reordering" view. Typed as a string
   * because it arrives from a URL parameter; the API validates it and returns
   * 422 on an unknown value.
   */
  stock_status?: string;
  q?: string;
  include_inactive?: boolean;
}

/** Drop blank filter values so they don't reach the API as empty query params. */
function clean<T extends object>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, value]) => value !== '' && value !== undefined && value !== null),
  ) as Partial<T>;
}

export const getFeedDashboard = (months = 12) =>
  api.get<FeedDashboard>('/feed/dashboard', { params: { months } }).then((r) => r.data);

export const listFeedProducts = (filters: ProductFilters = {}) =>
  api.get<FeedProduct[]>('/feed/products', { params: clean(filters) }).then((r) => r.data);

export const getFeedProduct = (id: number, months = 12) =>
  api.get<FeedProductDetail>(`/feed/products/${id}`, { params: { months } }).then((r) => r.data);

export const createFeedProduct = (body: FeedProductInput) =>
  api.post<FeedProduct>('/feed/products', body).then((r) => r.data);

export const updateFeedProduct = (id: number, body: FeedProductPatch) =>
  api.patch<FeedProduct>(`/feed/products/${id}`, body).then((r) => r.data);

export const retireFeedProduct = (id: number) =>
  api.delete<{ detail: string }>(`/feed/products/${id}`).then((r) => r.data);

export interface BatchFilters {
  product_id?: number;
  expiry_status?: ExpiryStatus | '';
  in_stock_only?: boolean;
  limit?: number;
}

export const listFeedBatches = (filters: BatchFilters = {}) =>
  api.get<FeedBatch[]>('/feed/batches', { params: clean(filters) }).then((r) => r.data);

export const receiveFeedBatch = (body: FeedBatchInput) =>
  api.post<FeedBatch>('/feed/batches', body).then((r) => r.data);

export interface MovementFilters {
  product_id?: number;
  movement_type?: MovementType | '';
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export const listFeedMovements = (filters: MovementFilters = {}) =>
  api.get<FeedMovement[]>('/feed/movements', { params: clean(filters) }).then((r) => r.data);

export const createFeedMovement = (body: FeedMovementInput) =>
  api.post<FeedMovementResult>('/feed/movements', body).then((r) => r.data);
