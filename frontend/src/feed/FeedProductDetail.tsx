import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Loading, PageHeader, TableScroll } from '../components/ui';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import { getFeedProduct, retireFeedProduct } from './feedApi';
import { ErrorBanner, ExpiryPill, MovementPill, PrimaryButton, Section, StatTile, StockPill } from './ui';
import { expiryCountdown, units } from './compute';
import { SPECIES_ICON, SPECIES_LABEL } from './constants';
import { ExpiryChart, ProductMovementChart } from './charts';
import type { FeedProductDetail as Detail } from './types';

/**
 * Single-product drill-down: position, performance and the full paper trail.
 *
 * Everything on this page comes from one `GET /feed/products/{id}` round trip —
 * the API assembles the lots, the ledger and the per-product analytics together
 * so the view can't show a half-consistent picture.
 */
export default function FeedProductDetail(): ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const productId = Number(id);

  const [data, setData] = useState<Detail | null>(null);
  /**
   * Which product `data` actually describes.
   *
   * React Router reuses this component when navigating detail -> detail, so a
   * plain `loading` flag would still read `false` from the previous product and
   * flash its numbers under the new product's name. Deriving "is this the data I
   * asked for?" is correct by construction instead.
   */
  const [loadedFor, setLoadedFor] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const loading = loadedFor !== productId && !error;

  // Writes state only from the promise callbacks (no synchronous setState in the
  // effect body), with an `alive` guard so navigating away mid-flight is a no-op.
  useEffect(() => {
    let alive = true;
    if (!Number.isFinite(productId)) {
      // A bad URL is decided synchronously, so resolve it as a rejected fetch
      // rather than writing state straight from the effect body.
      Promise.resolve().then(() => {
        if (alive) setError('Invalid product.');
      });
      return () => {
        alive = false;
      };
    }
    getFeedProduct(productId)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError('');
        setLoadedFor(productId);
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, 'Could not load this product.'));
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  const handleRetire = async () => {
    if (!data) return;
    if (!window.confirm(`Retire ${data.product.sku}? It will be hidden from the catalogue.`)) return;
    setActionError('');
    try {
      await retireFeedProduct(data.product.id);
      navigate('/feed/products');
    } catch (err) {
      setActionError(errorMessage(err, 'Could not retire this product.'));
    }
  };

  if (error) {
    return (
      <div className="p-4 sm:p-8">
        <ErrorBanner message={error} />
        <Link to="/feed/products" className="text-sm font-semibold text-[#3f7d3f]">
          ← Back to products
        </Link>
      </div>
    );
  }
  if (loading || !data) return <Loading label="Loading product…" />;

  const { product } = data;

  return (
    <div className="p-4 sm:p-8">
      <Link
        to="/feed/products"
        className="mb-4 inline-block text-sm font-semibold text-slate-400 transition hover:text-[#3f7d3f]"
      >
        ← Products
      </Link>

      <PageHeader
        title={product.name}
        subtitle={`${SPECIES_ICON[product.species]} ${SPECIES_LABEL[product.species]} · ${product.sku} · ${product.unit_label}${
          product.brand ? ` · ${product.brand}` : ''
        }`}
        actions={
          <div className="flex items-center gap-3">
            <StockPill status={product.stock_status} />
            {product.is_active && (
              <button
                type="button"
                onClick={handleRetire}
                className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 transition hover:border-red-200 hover:text-red-600"
              >
                Retire
              </button>
            )}
            <PrimaryButton onClick={() => navigate(`/feed/inventory?product_id=${product.id}`)}>
              Receive stock
            </PrimaryButton>
          </div>
        }
      />

      {actionError && <ErrorBanner message={actionError} />}

      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="On hand"
            value={units(product.on_hand)}
            hint={
              product.expired_units > 0
                ? `${units(product.sellable_units)} sellable · ${units(product.expired_units)} expired`
                : `${product.batch_count} batch${product.batch_count === 1 ? '' : 'es'}`
            }
            tone={product.expired_units > 0 ? 'warn' : 'default'}
            icon="📦"
          />
          <StatTile
            label="Stock value"
            value={money(product.stock_value_cost)}
            hint={`${money(product.stock_value_retail)} at retail`}
            icon="💰"
          />
          <StatTile
            label="Sold (90 days)"
            value={units(data.units_sold_90d)}
            hint={`${money(data.revenue_90d)} revenue · ${money(data.margin_90d)} margin`}
            icon="🧾"
          />
          <StatTile
            label="Days of cover"
            value={data.days_of_cover === null ? '—' : `${data.days_of_cover}d`}
            hint={
              data.days_of_cover === null
                ? 'No sales in the last 90 days'
                : `At the recent sales rate · reorder at ${product.reorder_level}`
            }
            tone={
              data.days_of_cover !== null && data.days_of_cover < 14
                ? 'bad'
                : data.days_of_cover !== null && data.days_of_cover < 30
                  ? 'warn'
                  : 'good'
            }
            icon="⏱️"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile label="Unit cost" value={money(product.unit_cost)} hint="Standard cost" />
          <StatTile label="Unit price" value={money(product.unit_price)} hint="List price" />
          <StatTile
            label="Gross margin"
            value={`${product.margin_pct}%`}
            hint={`${money(product.margin_per_unit)} per ${product.package_type}`}
            tone={product.margin_pct >= 20 ? 'good' : 'warn'}
          />
          <StatTile
            label="Sell-through"
            value={`${data.sell_through_pct}%`}
            hint={`Shelf life ${product.shelf_life_days} days`}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProductMovementChart rows={data.monthly} />
          <ExpiryChart buckets={data.expiry_buckets} />
        </div>

        <Section
          title="Batches"
          subtitle="Every lot received, nearest expiry first. Sales draw in this order."
        >
          {data.batches.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">
              No stock received yet for this product.
            </p>
          ) : (
            <TableScroll minWidth="min-w-[760px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Batch</th>
                    <th className="py-2 pr-3 font-semibold">Supplier</th>
                    <th className="py-2 pr-3 font-semibold">Received</th>
                    <th className="py-2 pr-3 font-semibold">Expires</th>
                    <th className="py-2 pr-3 text-right font-semibold">Remaining</th>
                    <th className="py-2 pr-3 text-right font-semibold">Unit cost</th>
                    <th className="py-2 pr-3 text-right font-semibold">Value</th>
                    <th className="py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {data.batches.map((batch) => (
                    <tr key={batch.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">
                        {batch.batch_code}
                      </td>
                      <td className="py-2.5 pr-3 text-slate-500">{batch.supplier ?? '—'}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-500">{batch.received_date}</td>
                      <td className="py-2.5 pr-3 tabular-nums text-slate-500">
                        {batch.expiry_date ?? '—'}
                        <span className="ml-1 text-xs text-slate-400">
                          ({expiryCountdown(batch.days_to_expiry)})
                        </span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums">
                        {units(batch.quantity_remaining)}
                        <span className="text-xs text-slate-400"> / {units(batch.quantity_received)}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                        {money(batch.unit_cost)}
                      </td>
                      <td className="py-2.5 pr-3 text-right font-semibold tabular-nums">
                        {money(batch.value_at_cost)}
                      </td>
                      <td className="py-2.5">
                        <ExpiryPill status={batch.expiry_status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Section>

        <Section
          title="Stock ledger"
          subtitle="Every quantity change, newest first"
          action={
            <Link
              to={`/feed/movements?product_id=${product.id}`}
              className="text-xs font-semibold text-slate-400 transition hover:text-[#3f7d3f]"
            >
              Record a movement →
            </Link>
          }
        >
          {data.movements.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-400">No movements recorded yet.</p>
          ) : (
            <TableScroll minWidth="min-w-[700px]">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                    <th className="py-2 pr-3 font-semibold">Date</th>
                    <th className="py-2 pr-3 font-semibold">Type</th>
                    <th className="py-2 pr-3 font-semibold">Batch</th>
                    <th className="py-2 pr-3 text-right font-semibold">Units</th>
                    <th className="py-2 pr-3 text-right font-semibold">Cost</th>
                    <th className="py-2 pr-3 text-right font-semibold">Revenue</th>
                    <th className="py-2 font-semibold">Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {data.movements.slice(0, 50).map((movement) => (
                    <tr key={movement.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-2.5 pr-3 tabular-nums text-slate-500">{movement.occurred_on}</td>
                      <td className="py-2.5 pr-3">
                        <MovementPill type={movement.movement_type} />
                      </td>
                      <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">
                        {movement.batch_code ?? '—'}
                      </td>
                      <td
                        className={`py-2.5 pr-3 text-right font-semibold tabular-nums ${
                          movement.quantity > 0 ? 'text-green-700' : 'text-slate-700'
                        }`}
                      >
                        {movement.quantity > 0 ? '+' : ''}
                        {units(movement.quantity)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                        {money(movement.line_cost)}
                      </td>
                      <td className="py-2.5 pr-3 text-right tabular-nums text-slate-500">
                        {movement.line_revenue ? money(movement.line_revenue) : '—'}
                      </td>
                      <td className="py-2.5 text-xs text-slate-400">
                        {movement.reference ?? movement.note ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          )}
        </Section>

        {product.notes && (
          <Section title="Notes">
            <p className="whitespace-pre-wrap text-sm text-slate-600">{product.notes}</p>
          </Section>
        )}
      </div>
    </div>
  );
}
