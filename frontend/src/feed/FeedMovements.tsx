import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Loading, Modal, PageHeader, TableScroll } from '../components/ui';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import {
  createFeedMovement,
  listFeedBatches,
  listFeedMovements,
  listFeedProducts,
} from './feedApi';
import { ErrorBanner, Field, MovementPill, PrimaryButton, StatTile, fieldClass } from './ui';
import { expiryCountdown, units } from './compute';
import { MOVEMENT_HINT, MOVEMENT_LABEL, OPERATOR_MOVEMENTS } from './constants';
import type {
  FeedBatch,
  FeedMovement,
  FeedMovementInput,
  FeedProduct,
  MovementType,
} from './types';

type OperatorMovement = Exclude<MovementType, 'receipt'>;

/** Movements that add stock must name the lot they land in (the API enforces it). */
function isInbound(type: OperatorMovement, quantity: number): boolean {
  if (type === 'return') return true;
  return type === 'adjustment' && quantity > 0;
}

function MovementForm({
  products,
  batches,
  initialProductId,
  onProductChange,
  onSubmit,
  onCancel,
  saving,
}: {
  products: FeedProduct[];
  /** Lots for the selected product — the parent fetches them on change. */
  batches: FeedBatch[];
  initialProductId?: number;
  onProductChange: (productId: number) => void;
  onSubmit: (values: FeedMovementInput) => void;
  onCancel: () => void;
  saving: boolean;
}): ReactElement {
  const [productId, setProductId] = useState<number>(initialProductId ?? products[0]?.id ?? 0);
  const [type, setType] = useState<OperatorMovement>('sale');
  const [quantity, setQuantity] = useState(0);
  const [batchId, setBatchId] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [occurredOn, setOccurredOn] = useState(new Date().toISOString().slice(0, 10));

  const product = products.find((p) => p.id === productId);
  const inbound = isInbound(type, quantity);
  // Sales cannot draw on expired lots, so don't offer them for selection. This
  // mirrors the server's allocation rule for the dropdown only — the server is
  // still what enforces it.
  const selectableBatches = batches.filter(
    (b) => (type === 'sale' ? b.expiry_status !== 'expired' : true) && (inbound || b.quantity_remaining > 0),
  );

  // For a sale the API already publishes the authoritative figure as
  // `sellable_units`; only the all-lots total (write-off, adjustment) has to be
  // summed here, and that is arithmetic rather than a business rule.
  const available =
    type === 'sale'
      ? (product?.sellable_units ?? 0)
      : selectableBatches.reduce((sum, b) => sum + b.quantity_remaining, 0);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          product_id: productId,
          movement_type: type,
          quantity,
          batch_id: batchId ? Number(batchId) : null,
          unit_price: unitPrice === '' ? null : Number(unitPrice),
          reference: reference || null,
          note: note || null,
          occurred_on: occurredOn || null,
        });
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Product">
          <select
            className={fieldClass}
            required
            value={productId}
            onChange={(e) => {
              const next = Number(e.target.value);
              setProductId(next);
              setBatchId('');
              onProductChange(next);
            }}
          >
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Movement" hint={MOVEMENT_HINT[type]}>
          <select
            className={fieldClass}
            value={type}
            onChange={(e) => {
              setType(e.target.value as OperatorMovement);
              setBatchId('');
            }}
          >
            {OPERATOR_MOVEMENTS.map((m) => (
              <option key={m} value={m}>
                {MOVEMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field
          label={type === 'adjustment' ? 'Quantity (+/−)' : `Quantity (${product?.package_type ?? 'units'})`}
          hint={
            type === 'adjustment'
              ? 'Negative removes stock; positive adds to a named lot'
              : // "Sellable" only for a sale — a write-off can draw on expired
                // lots too, so calling that figure sellable would be a lie.
                `${units(available)} ${type === 'sale' ? 'sellable' : 'available'}`
          }
        >
          <input
            className={fieldClass}
            type="number"
            required
            min={type === 'adjustment' ? undefined : 1}
            value={quantity || ''}
            onChange={(e) => setQuantity(Number(e.target.value))}
          />
        </Field>
        <Field label="Date">
          <input
            className={fieldClass}
            type="date"
            required
            value={occurredOn}
            onChange={(e) => setOccurredOn(e.target.value)}
          />
        </Field>
        {type === 'sale' && (
          <Field label="Unit price" hint={`Blank uses list price ${money(product?.unit_price ?? 0)}`}>
            <input
              className={fieldClass}
              type="number"
              min={0}
              step="0.01"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
            />
          </Field>
        )}
      </div>

      <Field
        label={inbound ? 'Batch (required)' : 'Batch (optional)'}
        hint={
          inbound
            ? 'Stock coming back must be attributed to the lot it belongs to'
            : 'Leave blank to draw nearest-expiry-first across all lots'
        }
      >
        <select
          className={fieldClass}
          required={inbound}
          value={batchId}
          onChange={(e) => setBatchId(e.target.value)}
        >
          <option value="">{inbound ? 'Select a batch…' : 'Automatic (nearest expiry first)'}</option>
          {selectableBatches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.batch_code} · {units(b.quantity_remaining)}/{units(b.quantity_received)} ·{' '}
              {expiryCountdown(b.days_to_expiry)}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Reference" hint="Invoice or customer, optional">
          <input
            className={fieldClass}
            maxLength={60}
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
        <Field label="Note" hint="Optional">
          <input
            className={fieldClass}
            maxLength={200}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </div>

      {type === 'sale' && quantity > 0 && product && (
        <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">
          Selling <strong>{units(quantity)}</strong> × {product.unit_label} for{' '}
          <strong>{money(quantity * (unitPrice === '' ? product.unit_price : Number(unitPrice)))}</strong>
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
          {saving ? 'Recording…' : `Record ${MOVEMENT_LABEL[type].toLowerCase()}`}
        </PrimaryButton>
      </div>
    </form>
  );
}

/**
 * The stock ledger: every quantity change, and the form that writes to it.
 *
 * The ledger is append-only — there is no edit or delete. A mistake is corrected
 * with a compensating movement, which is what makes the history trustworthy.
 */
export default function FeedMovements(): ReactElement {
  const [params, setParams] = useSearchParams();
  const [rows, setRows] = useState<FeedMovement[]>([]);
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [formBatches, setFormBatches] = useState<FeedBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  /** Bumped after a successful write to refetch the ledger. */
  const [reload, setReload] = useState(0);

  const movementType = (params.get('movement_type') ?? '') as MovementType | '';
  const productParam = params.get('product_id');
  const productId = productParam ? Number(productParam) : undefined;
  const dateFrom = params.get('date_from') ?? '';
  const dateTo = params.get('date_to') ?? '';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // The handler owns the spinner; the effect never sets state synchronously.
    setLoading(true);
    setParams(next, { replace: true });
  };

  // `reload` bumps after a successful write so the ledger refetches. State is
  // written only from the promise callbacks — never synchronously in the effect
  // body — and `alive` drops responses from superseded filter changes.
  useEffect(() => {
    let alive = true;
    Promise.all([
      listFeedMovements({
        movement_type: movementType,
        product_id: Number.isFinite(productId) ? productId : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        limit: 200,
      }),
      listFeedProducts(),
    ])
      .then(([movementRows, productRows]) => {
        if (!alive) return;
        setRows(movementRows);
        setProducts(productRows);
        setError('');
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, 'Could not load the stock ledger.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [movementType, productId, dateFrom, dateTo, reload]);

  // Guards against out-of-order responses: switching product A -> B quickly could
  // otherwise land A's lots in the dropdown while B is selected, offering batch
  // ids that belong to a different product.
  const batchRequest = useRef(0);

  const loadBatchesFor = useCallback(async (target: number) => {
    const request = ++batchRequest.current;
    if (!target) {
      setFormBatches([]);
      return;
    }
    try {
      const rows = await listFeedBatches({ product_id: target, in_stock_only: false });
      if (request === batchRequest.current) setFormBatches(rows);
    } catch {
      // A failed lot fetch only costs the operator the batch dropdown; the form
      // still works in automatic (FEFO) mode, and the API validates regardless.
      if (request === batchRequest.current) setFormBatches([]);
    }
  }, []);

  const totals = useMemo(
    () => ({
      sold: rows.filter((r) => r.movement_type === 'sale').reduce((sum, r) => sum + Math.abs(r.quantity), 0),
      revenue: rows.reduce((sum, r) => sum + r.line_revenue, 0),
      cogs: rows
        .filter((r) => r.movement_type === 'sale')
        .reduce((sum, r) => sum + r.line_cost, 0),
      writtenOff: rows
        .filter((r) => r.movement_type === 'write_off')
        .reduce((sum, r) => sum + r.line_cost, 0),
    }),
    [rows],
  );

  const openRecorder = async () => {
    setFormError('');
    setRecording(true);
    const target = Number.isFinite(productId) ? (productId as number) : (products[0]?.id ?? 0);
    await loadBatchesFor(target);
  };

  const handleRecord = async (values: FeedMovementInput) => {
    setSaving(true);
    setFormError('');
    try {
      await createFeedMovement(values);
      setRecording(false);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not record this movement.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Stock ledger"
        subtitle="Append-only record of every quantity change. Correct mistakes with a new movement."
        actions={<PrimaryButton onClick={openRecorder}>+ Record movement</PrimaryButton>}
      />

      {error && <ErrorBanner message={error} />}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Units sold" value={units(totals.sold)} icon="🧾" />
        <StatTile label="Revenue" value={money(totals.revenue)} icon="💵" />
        <StatTile
          label="Gross margin"
          value={money(totals.revenue - totals.cogs)}
          tone={totals.revenue - totals.cogs >= 0 ? 'good' : 'bad'}
          icon="📈"
        />
        <StatTile
          label="Written off"
          value={money(totals.writtenOff)}
          tone={totals.writtenOff > 0 ? 'warn' : 'good'}
          icon="🗑️"
        />
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Type</span>
          <select
            className={`${fieldClass} w-40`}
            value={movementType}
            onChange={(e) => setParam('movement_type', e.target.value)}
          >
            <option value="">All</option>
            {(['receipt', ...OPERATOR_MOVEMENTS] as MovementType[]).map((m) => (
              <option key={m} value={m}>
                {MOVEMENT_LABEL[m]}
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
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">From</span>
          <input
            className={`${fieldClass} w-40`}
            type="date"
            value={dateFrom}
            onChange={(e) => setParam('date_from', e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">To</span>
          <input
            className={`${fieldClass} w-40`}
            type="date"
            value={dateTo}
            onChange={(e) => setParam('date_to', e.target.value)}
          />
        </label>
      </div>

      {loading ? (
        <Loading label="Loading ledger…" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400">
          No movements match these filters.
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-2 shadow-sm sm:p-4">
          <TableScroll minWidth="min-w-[880px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Date</th>
                  <th className="py-2 pr-3 font-semibold">Type</th>
                  <th className="py-2 pr-3 font-semibold">Product</th>
                  <th className="py-2 pr-3 font-semibold">Batch</th>
                  <th className="py-2 pr-3 text-right font-semibold">Units</th>
                  <th className="py-2 pr-3 text-right font-semibold">Unit cost</th>
                  <th className="py-2 pr-3 text-right font-semibold">Revenue</th>
                  <th className="py-2 font-semibold">Reference</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((movement) => (
                  <tr key={movement.id} className="border-b border-slate-50 last:border-0">
                    <td className="py-2.5 pr-3 tabular-nums text-slate-500">{movement.occurred_on}</td>
                    <td className="py-2.5 pr-3">
                      <MovementPill type={movement.movement_type} />
                    </td>
                    <td className="py-2.5 pr-3">
                      <Link
                        to={`/feed/products/${movement.product_id}`}
                        className="font-semibold text-slate-800 hover:text-[#3f7d3f]"
                      >
                        {movement.product_name}
                      </Link>
                      <div className="font-mono text-xs text-slate-400">{movement.product_sku}</div>
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
                      {movement.unit_cost === null ? '—' : money(movement.unit_cost)}
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
        </div>
      )}

      <Modal
        open={recording}
        onClose={() => setRecording(false)}
        title="Record stock movement"
        subtitle="Outbound quantities are drawn nearest-expiry-first"
      >
        {formError && <ErrorBanner message={formError} />}
        {products.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            Add a product before recording movements.
          </p>
        ) : (
          <MovementForm
            products={products}
            batches={formBatches}
            initialProductId={Number.isFinite(productId) ? productId : undefined}
            onProductChange={(next) => void loadBatchesFor(next)}
            onSubmit={handleRecord}
            onCancel={() => setRecording(false)}
            saving={saving}
          />
        )}
      </Modal>
    </div>
  );
}
