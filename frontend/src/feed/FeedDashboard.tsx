import { useEffect, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader, TableScroll, Loading } from '../components/ui';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import { getFeedDashboard } from './feedApi';
import { ErrorBanner, Section, StatTile } from './ui';
import { compactMoney, expiryCountdown, momChange, shortPeriod, units } from './compute';
import { SPECIES_ICON, SPECIES_LABEL } from './constants';
import {
  ExpiryChart,
  MarginChart,
  SalesTrendChart,
  SpeciesMixChart,
  TopSellersChart,
} from './charts';
import type { FeedAlert, FeedDashboard as Dashboard, Species } from './types';

const WINDOWS = [6, 12, 24] as const;

/** Alert table shared by the reorder / expiring / expired panels. */
function AlertTable({
  rows,
  emptyMessage,
  showExpiry,
  onOpen,
}: {
  rows: FeedAlert[];
  emptyMessage: string;
  showExpiry?: boolean;
  onOpen: (productId: number) => void;
}): ReactElement {
  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-400">{emptyMessage}</p>;
  }
  return (
    <TableScroll minWidth={showExpiry ? 'min-w-[520px]' : 'min-w-[400px]'}>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="py-2 pr-3 font-semibold">Product</th>
            {showExpiry && <th className="py-2 pr-3 font-semibold">Batch</th>}
            <th className="py-2 pr-3 text-right font-semibold">Units</th>
            <th className="py-2 pr-3 text-right font-semibold">Value</th>
            {showExpiry ? (
              <th className="py-2 text-right font-semibold">Expires</th>
            ) : (
              <th className="py-2 text-right font-semibold">Reorder at</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={`${row.product_id}-${row.batch_id ?? 'p'}`}
              onClick={() => onOpen(row.product_id)}
              className="cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50"
            >
              <td className="py-2.5 pr-3">
                <div className="font-semibold text-slate-800">{row.name}</div>
                <div className="text-xs text-slate-400">
                  {SPECIES_ICON[row.species]} {row.sku}
                </div>
              </td>
              {showExpiry && (
                <td className="py-2.5 pr-3 font-mono text-xs text-slate-500">{row.batch_code}</td>
              )}
              <td className="py-2.5 pr-3 text-right tabular-nums">{units(row.units)}</td>
              <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.value)}</td>
              <td className="py-2.5 text-right tabular-nums">
                {showExpiry ? (
                  <span
                    className={
                      (row.days_to_expiry ?? 0) < 0
                        ? 'font-semibold text-red-600'
                        : 'font-semibold text-amber-600'
                    }
                  >
                    {expiryCountdown(row.days_to_expiry)}
                  </span>
                ) : (
                  <span className="text-slate-400">{row.reorder_level ?? '—'}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </TableScroll>
  );
}

/**
 * Hormaal Animal Feed — inventory command centre.
 *
 * Ordered by what an owner actually needs, in order: what the stock is worth,
 * what is at risk, how it is trading, and what to do about it today.
 */
export default function FeedDashboard(): ReactElement {
  const navigate = useNavigate();
  const [months, setMonths] = useState<number>(12);
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // State is only written from the promise callbacks, never synchronously in the
  // effect body: that keeps React from cascading renders, and the `alive` guard
  // stops a slow response from a previous window overwriting a newer one.
  useEffect(() => {
    let alive = true;
    getFeedDashboard(months)
      .then((next) => {
        if (!alive) return;
        setData(next);
        setError('');
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, 'Could not load the inventory dashboard.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [months]);

  const openProduct = (productId: number) => navigate(`/feed/products/${productId}`);

  if (loading && !data) return <Loading label="Loading inventory…" />;

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Inventory dashboard"
        subtitle="Stock position, expiry exposure and trading performance."
        actions={
          <div className="flex rounded-xl bg-slate-100 p-1">
            {WINDOWS.map((window) => (
              <button
                key={window}
                type="button"
                onClick={() => {
                  setLoading(true);
                  setMonths(window);
                }}
                aria-pressed={months === window}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  months === window ? 'bg-white text-[#3f7d3f] shadow' : 'text-slate-500'
                }`}
              >
                {window}m
              </button>
            ))}
          </div>
        }
      />

      {error && <ErrorBanner message={error} />}

      {data && (
        <div className="space-y-6">
          {/* --- valuation --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Stock value (cost)"
              value={money(data.stock_value_cost)}
              hint={`${units(data.total_units)} units across ${data.active_products} products`}
              icon="📦"
            />
            <StatTile
              label="Retail value"
              value={money(data.stock_value_retail)}
              hint={`${money(data.potential_margin)} potential margin`}
              icon="🏷️"
            />
            <StatTile
              label="Margin if sold"
              value={`${data.potential_margin_pct}%`}
              tone={data.potential_margin_pct >= 20 ? 'good' : 'warn'}
              hint="Gross margin on current stock"
              icon="📈"
            />
            <StatTile
              label={`Sold in ${shortPeriod(data.period)}`}
              value={units(data.units_sold_mtd)}
              hint={`${money(data.revenue_mtd)} revenue · ${money(data.margin_mtd)} margin`}
              icon="🧾"
            />
          </div>

          {/* --- risk --- */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Needs reordering"
              value={data.low_stock_count + data.out_of_stock_count}
              tone={data.out_of_stock_count > 0 ? 'bad' : data.low_stock_count > 0 ? 'warn' : 'good'}
              hint={`${data.out_of_stock_count} out of stock · ${data.low_stock_count} low`}
              icon="🔔"
              // Both statuses, matching the count on the tile — drilling into
              // "low" alone would drop the out-of-stock half on arrival.
              onClick={() => navigate('/feed/products?stock_status=low,out_of_stock')}
            />
            <StatTile
              label="Expiring within 30 days"
              value={units(data.expiring_units)}
              tone={data.expiring_units > 0 ? 'warn' : 'good'}
              hint={`${money(data.expiring_value)} · ${data.expiring_value_pct}% of stock value`}
              icon="⏳"
              onClick={() => navigate('/feed/inventory?expiry_status=expiring_soon')}
            />
            <StatTile
              label="Already expired"
              value={units(data.expired_units)}
              tone={data.expired_units > 0 ? 'bad' : 'good'}
              hint={`${money(data.expired_value)} · ${data.expired_value_pct}% of stock value`}
              icon="⚠️"
              onClick={() => navigate('/feed/inventory?expiry_status=expired')}
            />
            <StatTile
              label="Written off this month"
              value={money(data.write_off_value_mtd)}
              tone={data.write_off_value_mtd > 0 ? 'warn' : 'good'}
              hint={
                momChange(data.monthly, 'units_sold') !== null
                  ? `Sales ${momChange(data.monthly, 'units_sold')! >= 0 ? '+' : ''}${momChange(
                      data.monthly,
                      'units_sold',
                    )}% vs last month`
                  : 'Loss at cost'
              }
              icon="🗑️"
            />
          </div>

          {/* --- trend --- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SalesTrendChart rows={data.monthly} />
            <MarginChart rows={data.monthly} />
            <ExpiryChart buckets={data.expiry_buckets} />
            <SpeciesMixChart rows={data.by_species} />
            <TopSellersChart rows={data.top_sellers} />
            <Section title="Stock by species" subtitle="Units and value on hand today">
              {data.by_species.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-400">No stock on hand.</p>
              ) : (
                <div className="space-y-3">
                  {data.by_species.map((row) => {
                    const pct =
                      data.stock_value_cost > 0
                        ? Math.round((row.value / data.stock_value_cost) * 100)
                        : 0;
                    return (
                      <div key={row.name}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-semibold text-slate-700">
                            {SPECIES_ICON[row.name as Species]}{' '}
                            {SPECIES_LABEL[row.name as Species] ?? row.name}
                          </span>
                          <span className="tabular-nums text-slate-500">
                            {units(row.units)} · {compactMoney(row.value)} ({pct}%)
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                          <div
                            className="h-full rounded-full bg-[#6aa84f]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* --- act on it --- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Section title="Reorder now" subtitle="At or below the reorder point">
              <AlertTable
                rows={data.low_stock}
                emptyMessage="Every product is above its reorder point."
                onOpen={openProduct}
              />
            </Section>
            <Section title="Expiring soon" subtitle="Within 30 days — discount or move">
              <AlertTable
                rows={data.expiring}
                emptyMessage="Nothing expiring in the next 30 days."
                showExpiry
                onOpen={openProduct}
              />
            </Section>
            <Section title="Expired — write off" subtitle="Cannot be sold; still counted at cost">
              <AlertTable
                rows={data.expired}
                emptyMessage="No expired stock on the shelf."
                showExpiry
                onOpen={openProduct}
              />
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
