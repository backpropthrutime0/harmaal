import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading, Modal, PageHeader, TableScroll } from '../components/ui';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import { listFeedBatches, listFeedProducts, receiveFeedBatch } from './feedApi';
import { ErrorBanner, ExpiryPill, Field, PrimaryButton, StatTile, fieldClass } from './ui';
import { expiryCountdown, units } from './compute';
import { EXPIRY_STATUS_LABEL } from './constants';
import type { ExpiryStatus, FeedBatch, FeedBatchInput, FeedProduct } from './types';

const EXPIRY_FILTERS: (ExpiryStatus | '')[] = ['', 'expired', 'expiring_soon', 'fresh'];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function ReceiveForm({
  products,
  initialProductId,
  onSubmit,
  onCancel,
  saving,
}: {
  products: FeedProduct[];
  initialProductId?: number;
  onSubmit: (values: FeedBatchInput) => void;
  onCancel: () => void;
  saving: boolean;
}): ReactElement {
  const [productId, setProductId] = useState<number>(initialProductId ?? products[0]?.id ?? 0);
  const [batchCode, setBatchCode] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [unitCost, setUnitCost] = useState(0);
  const [receivedDate, setReceivedDate] = useState(todayIso());
  const [manufacturedDate, setManufacturedDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [supplier, setSupplier] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');

  const product = products.find((p) => p.id === productId);

  // Deliberately NOT computed here. Expiry derivation (manufactured-date-first,
  // falling back to the receipt date) is a business rule that lives in
  // `internal/feed_inventory.derive_expiry_date`; duplicating it in TypeScript is
  // how the two quietly drift apart. The form describes the rule and the server
  // applies it — the saved lot then shows the real date.
  const expiryHint = expiryDate
    ? 'Overriding the derived date'
    : product
      ? `Left blank: derived from the ${product.shelf_life_days}-day shelf life, counted from the manufactured date (or the received date if unknown)`
      : 'Derived from the shelf life';

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          product_id: productId,
          batch_code: batchCode,
          quantity,
          unit_cost: unitCost,
          received_date: receivedDate || null,
          manufactured_date: manufacturedDate || null,
          expiry_date: expiryDate || null,
          supplier: supplier || null,
          reference: reference || null,
          notes: notes || null,
        });
      }}
      className="space-y-4"
    >
      <Field label="Product">
        <select
          className={fieldClass}
          required
          value={productId}
          onChange={(e) => {
            setProductId(Number(e.target.value));
            // Default the lot cost to the product's standard cost as a starting point.
            const next = products.find((p) => p.id === Number(e.target.value));
            if (next && unitCost === 0) setUnitCost(next.unit_cost);
          }}
        >
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.sku} · {p.name} ({p.unit_label})
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Batch / lot code" hint="From the supplier's label">
          <input
            className={`${fieldClass} font-mono uppercase`}
            required
            maxLength={40}
            value={batchCode}
            onChange={(e) => setBatchCode(e.target.value)}
          />
        </Field>
        <Field label={`Quantity (${product?.package_type ?? 'units'})`}>
          <input
            className={fieldClass}
            type="number"
            required
            min={1}
            value={quantity || ''}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <Field label="Landed cost per unit" hint="This lot's actual cost">
          <input
            className={fieldClass}
            type="number"
            required
            min={0}
            step="0.01"
            value={unitCost || ''}
            onChange={(e) => setUnitCost(Number(e.target.value))}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Received">
          <input
            className={fieldClass}
            type="date"
            required
            value={receivedDate}
            onChange={(e) => setReceivedDate(e.target.value)}
          />
        </Field>
        <Field label="Manufactured" hint="Preferred basis for expiry">
          <input
            className={fieldClass}
            type="date"
            value={manufacturedDate}
            onChange={(e) => setManufacturedDate(e.target.value)}
          />
        </Field>
        <Field label="Expiry" hint={expiryHint}>
          <input
            className={fieldClass}
            type="date"
            value={expiryDate}
            onChange={(e) => setExpiryDate(e.target.value)}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Supplier" hint="Optional">
          <input
            className={fieldClass}
            maxLength={120}
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
          />
        </Field>
        <Field label="PO / invoice reference" hint="Optional">
          <input
            className={fieldClass}
            maxLength={60}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Notes" hint="Optional">
        <textarea
          className={fieldClass}
          rows={2}
          maxLength={500}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {quantity > 0 && unitCost > 0 && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Receiving <strong>{units(quantity)}</strong> × {product?.unit_label} at{' '}
          <strong>{money(unitCost)}</strong> each ={' '}
          <strong>{money(quantity * unitCost)}</strong>
          {expiryDate && <> · expires {expiryDate}</>}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2.5 font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          Cancel
        </button>
        <PrimaryButton type="submit" disabled={saving || products.length === 0}>
          {saving ? 'Receiving…' : 'Receive stock'}
        </PrimaryButton>
      </div>
    </form>
  );
}

/**
 * Goods receiving and the lot register.
 *
 * Receiving is the only way stock enters the system: a lot carries its own
 * landed cost and expiry date, and those are what every later sale is costed
 * and rotated against.
 */
export default function FeedInventory(): ReactElement {
  const [params, setParams] = useSearchParams();
  const [batches, setBatches] = useState<FeedBatch[]>([]);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [receiving, setReceiving] = useState(false);
  /** Bumped after a successful receipt to refetch the register. */
  const [reload, setReload] = useState(0);

  const expiryStatus = (params.get('expiry_status') ?? '') as ExpiryStatus | '';
  const productParam = params.get('product_id');
  const productId = productParam ? Number(productParam) : undefined;
  const inStockOnly = params.get('in_stock_only') !== 'false';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // The handler owns the spinner; the effect never sets state synchronously.
    setLoading(true);
    setParams(next, { replace: true });
  };

  // `reload` bumps after a successful receipt so the register refetches. State is
  // written only from the promise callbacks — never synchronously in the effect
  // body — and `alive` drops responses from superseded filter changes.
  useEffect(() => {
    let alive = true;
    Promise.all([
      listFeedBatches({
        expiry_status: expiryStatus,
        product_id: Number.isFinite(productId) ? productId : undefined,
        in_stock_only: inStockOnly,
      }),
      listFeedProducts(),
    ])
      .then(([batchRows, productRows]) => {
        if (!alive) return;
        setBatches(batchRows);
        setProducts(productRows);
        setError('');
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, 'Could not load stock batches.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [expiryStatus, productId, inStockOnly, reload]);

  const totals = useMemo(
    () => ({
      units: batches.reduce((sum, b) => sum + b.quantity_remaining, 0),
      value: batches.reduce((sum, b) => sum + b.value_at_cost, 0),
      expired: batches.filter((b) => b.expiry_status === 'expired').length,
      soon: batches.filter((b) => b.expiry_status === 'expiring_soon').length,
    }),
    [batches],
  );

  const handleReceive = async (values: FeedBatchInput) => {
    setSaving(true);
    setFormError('');
    try {
      await receiveFeedBatch(values);
      setReceiving(false);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not receive this batch.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Stock & batches"
        subtitle="Every lot on the shelf, with its own cost and expiry date."
        actions={
          <PrimaryButton
            onClick={() => {
              setFormError('');
              setReceiving(true);
            }}
          >
            + Receive stock
          </PrimaryButton>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Units shown" value={units(totals.units)} icon="📦" />
        <StatTile label="Value at cost" value={money(totals.value)} icon="💰" />
        <StatTile
          label="Expiring soon"
          value={totals.soon}
          tone={totals.soon > 0 ? 'warn' : 'good'}
          icon="⏳"
        />
        <StatTile
          label="Expired lots"
          value={totals.expired}
          tone={totals.expired > 0 ? 'bad' : 'good'}
          icon="⚠️"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Shelf life</span>
          <select
            className={`${fieldClass} w-44`}
            value={expiryStatus}
            onChange={(e) => setParam('expiry_status', e.target.value)}
          >
            {EXPIRY_FILTERS.map((status) => (
              <option key={status || 'all'} value={status}>
                {status ? EXPIRY_STATUS_LABEL[status] : 'All'}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Product</span>
          <select
            className={`${fieldClass} w-64`}
            value={productParam ?? ''}
            onChange={(e) => setParam('product_id', e.target.value)}
          >
            <option value="">All products</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setParam('in_stock_only', e.target.checked ? '' : 'false')}
          />
          Only lots with stock
        </label>
      </div>

      {loading ? (
        <Loading label="Loading batches…" />
      ) : batches.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400">
          No batches match these filters.
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-2 shadow-sm sm:p-4">
          <TableScroll minWidth="min-w-[900px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Batch</th>
                  <th className="py-2 pr-3 font-semibold">Product</th>
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
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-3 font-mono text-xs text-slate-600">{batch.batch_code}</td>
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/feed/products/${batch.product_id}`}
                        className="font-semibold text-slate-800 hover:text-[#3f7d3f]"
                      >
                        {batch.product_name}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{batch.product_sku}</div>
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
        </div>
      )}

      <Modal
        open={receiving}
        onClose={() => setReceiving(false)}
        title="Receive stock"
        subtitle="Creates a new lot and a receipt in the stock ledger"
      >
        {formError && <ErrorBanner message={formError} />}
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Add a product before receiving stock.
          </p>
        ) : (
          <ReceiveForm
            products={products}
            initialProductId={Number.isFinite(productId) ? productId : undefined}
            onSubmit={handleReceive}
            onCancel={() => setReceiving(false)}
            saving={saving}
          />
        )}
      </Modal>
    </div>
  );
}
