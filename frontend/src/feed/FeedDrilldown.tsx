import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loading, Modal, TableScroll } from '../components/ui';
import { Row, Td, Th } from '../dashboards/tables';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import {
  listFeedBatches,
  listFeedMovements,
  listFeedProducts,
  type BatchFilters,
  type MovementFilters,
  type ProductFilters,
} from './feedApi';
import { ErrorBanner, ExpiryPill, MovementPill, StockPill } from './ui';
import { expiryCountdown, units } from './compute';
import { SPECIES_ICON } from './constants';
import type { FeedBatch, FeedMovement, FeedProduct } from './types';

/**
 * Dashboard drill-downs.
 *
 * Every figure on the dashboard is an aggregate, and an aggregate you can't open
 * is a dead end — "$5,104 expired" is only useful if you can see *which* lots.
 * Each drill re-queries the API with the filter that produced the number, rather
 * than slicing a client-side copy: the detail view is then provably the same set
 * of records the tile or bar counted, and it can't drift as the chart evolves.
 */

/** What the user clicked, expressed as the query that reproduces it. */
export type Drill =
  | { kind: 'products'; title: string; subtitle?: string; filters: ProductFilters; goTo?: string }
  | { kind: 'lots'; title: string; subtitle?: string; filters: BatchFilters; goTo?: string }
  | { kind: 'movements'; title: string; subtitle?: string; filters: MovementFilters; goTo?: string };

type DrillRow = FeedProduct | FeedBatch | FeedMovement;

function ProductRows({ rows, onOpen }: { rows: FeedProduct[]; onOpen: (id: number) => void }) {
  const total = rows.reduce(
    (acc, p) => ({
      units: acc.units + p.on_hand,
      cost: acc.cost + p.stock_value_cost,
      retail: acc.retail + p.stock_value_retail,
    }),
    { units: 0, cost: 0, retail: 0 },
  );
  return (
    <TableScroll minWidth="min-w-[720px]">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Product</Th>
            <Th>Unit</Th>
            <Th right>On hand</Th>
            <Th right>Sellable</Th>
            <Th right>At cost</Th>
            <Th right>At retail</Th>
            <Th right>Margin</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <Row key={p.id} onClick={() => onOpen(p.id)}>
              <Td>
                <div className="font-semibold text-slate-800">{p.name}</div>
                <div className="font-mono text-xs text-slate-400">
                  {SPECIES_ICON[p.species]} {p.sku}
                </div>
              </Td>
              <Td>{p.unit_label}</Td>
              <Td right>{units(p.on_hand)}</Td>
              <Td right className={p.sellable_units < p.on_hand ? 'text-amber-600' : ''}>
                {units(p.sellable_units)}
              </Td>
              <Td right>{money(p.stock_value_cost)}</Td>
              <Td right>{money(p.stock_value_retail)}</Td>
              <Td right>{p.margin_pct}%</Td>
              <Td>
                <StockPill status={p.stock_status} />
              </Td>
            </Row>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <Td>{rows.length} product{rows.length === 1 ? '' : 's'}</Td>
            <Td> </Td>
            <Td right>{units(total.units)}</Td>
            <Td right> </Td>
            <Td right>{money(total.cost)}</Td>
            <Td right>{money(total.retail)}</Td>
            <Td right> </Td>
            <Td> </Td>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

function LotRows({ rows, onOpen }: { rows: FeedBatch[]; onOpen: (id: number) => void }) {
  const total = rows.reduce(
    (acc, b) => ({ units: acc.units + b.quantity_remaining, value: acc.value + b.value_at_cost }),
    { units: 0, value: 0 },
  );
  return (
    <TableScroll minWidth="min-w-[760px]">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Batch</Th>
            <Th>Product</Th>
            <Th>Supplier</Th>
            <Th>Received</Th>
            <Th>Expires</Th>
            <Th right>Remaining</Th>
            <Th right>Value</Th>
            <Th>Status</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <Row key={b.id} onClick={() => onOpen(b.product_id)}>
              <Td className="font-mono text-xs">{b.batch_code}</Td>
              <Td>{b.product_name}</Td>
              <Td>{b.supplier ?? '—'}</Td>
              <Td>{b.received_date}</Td>
              <Td>
                {b.expiry_date ?? '—'}
                <span className="ml-1 text-xs text-slate-400">({expiryCountdown(b.days_to_expiry)})</span>
              </Td>
              <Td right>
                {units(b.quantity_remaining)}
                <span className="text-xs text-slate-400"> / {units(b.quantity_received)}</span>
              </Td>
              <Td right>{money(b.value_at_cost)}</Td>
              <Td>
                <ExpiryPill status={b.expiry_status} />
              </Td>
            </Row>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <Td>
              {rows.length} lot{rows.length === 1 ? '' : 's'}
            </Td>
            <Td> </Td>
            <Td> </Td>
            <Td> </Td>
            <Td> </Td>
            <Td right>{units(total.units)}</Td>
            <Td right>{money(total.value)}</Td>
            <Td> </Td>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

function MovementRows({ rows, onOpen }: { rows: FeedMovement[]; onOpen: (id: number) => void }) {
  const total = rows.reduce(
    (acc, m) => ({
      units: acc.units + Math.abs(m.quantity),
      cost: acc.cost + m.line_cost,
      revenue: acc.revenue + m.line_revenue,
    }),
    { units: 0, cost: 0, revenue: 0 },
  );
  const margin = total.revenue - total.cost;
  return (
    <TableScroll minWidth="min-w-[760px]">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Product</Th>
            <Th>Batch</Th>
            <Th right>Units</Th>
            <Th right>Cost</Th>
            <Th right>Revenue</Th>
            <Th>Reference</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <Row key={m.id} onClick={() => onOpen(m.product_id)}>
              <Td>{m.occurred_on}</Td>
              <Td>
                <MovementPill type={m.movement_type} />
              </Td>
              <Td>{m.product_name}</Td>
              <Td className="font-mono text-xs">{m.batch_code ?? '—'}</Td>
              <Td right className={m.quantity > 0 ? 'text-green-700' : ''}>
                {m.quantity > 0 ? '+' : ''}
                {units(m.quantity)}
              </Td>
              <Td right>{money(m.line_cost)}</Td>
              <Td right>{m.line_revenue ? money(m.line_revenue) : '—'}</Td>
              <Td className="text-xs text-slate-400">{m.reference ?? m.note ?? '—'}</Td>
            </Row>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-slate-200 font-semibold">
            <Td>
              {rows.length} movement{rows.length === 1 ? '' : 's'}
            </Td>
            <Td> </Td>
            <Td> </Td>
            <Td> </Td>
            <Td right>{units(total.units)}</Td>
            <Td right>{money(total.cost)}</Td>
            <Td right>{money(total.revenue)}</Td>
            <Td className="text-xs text-slate-500">
              {total.revenue > 0 ? `${money(margin)} margin` : ' '}
            </Td>
          </tr>
        </tfoot>
      </table>
    </TableScroll>
  );
}

/** Fetch the records behind a dashboard figure and show them. */
export function FeedDrilldown({ drill, onClose }: { drill: Drill | null; onClose: () => void }): ReactElement {
  const navigate = useNavigate();
  /**
   * The fetched records *and* the drill they belong to.
   *
   * Stored together rather than reset on open: clearing state synchronously in
   * the effect below would cascade renders, and tagging the result means a slow
   * response from a tile the user has already clicked past can never be rendered
   * under a different title. Drill objects are fresh on every click, so identity
   * comparison is exactly the "is this what I asked for?" test.
   */
  const [result, setResult] = useState<{ drill: Drill; rows?: DrillRow[]; error?: string } | null>(
    null,
  );
  const current = result?.drill === drill ? result : null;
  const rows = current?.rows ?? null;
  const error = current?.error ?? '';

  useEffect(() => {
    if (!drill) return;
    let alive = true;

    const request =
      drill.kind === 'products'
        ? listFeedProducts(drill.filters)
        : drill.kind === 'lots'
          ? listFeedBatches(drill.filters)
          : listFeedMovements(drill.filters);

    request
      .then((next: DrillRow[]) => {
        if (alive) setResult({ drill, rows: next });
      })
      .catch((err) => {
        if (alive) setResult({ drill, error: errorMessage(err, 'Could not load these records.') });
      });

    return () => {
      alive = false;
    };
  }, [drill]);

  const openProduct = (productId: number) => {
    onClose();
    navigate(`/feed/products/${productId}`);
  };

  return (
    <Modal open={Boolean(drill)} onClose={onClose} title={drill?.title ?? ''} subtitle={drill?.subtitle}>
      {error && <ErrorBanner message={error} />}
      {!error && rows === null && <Loading label="Loading records…" />}
      {!error && rows !== null && rows.length === 0 && (
        <p className="py-8 text-center text-sm text-slate-400">Nothing matches this figure.</p>
      )}
      {!error && rows !== null && rows.length > 0 && drill && (
        <>
          {drill.kind === 'products' && (
            <ProductRows rows={rows as FeedProduct[]} onOpen={openProduct} />
          )}
          {drill.kind === 'lots' && <LotRows rows={rows as FeedBatch[]} onOpen={openProduct} />}
          {drill.kind === 'movements' && (
            <MovementRows rows={rows as FeedMovement[]} onOpen={openProduct} />
          )}
          <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
            <span>Select a row to open its product.</span>
            {drill.goTo && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  navigate(drill.goTo as string);
                }}
                className="font-semibold text-[#3f7d3f] hover:underline"
              >
                Open the full view →
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}
