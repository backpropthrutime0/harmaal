import { useEffect, useMemo, useState } from 'react';
import type { ReactElement } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loading, Modal, PageHeader, TableScroll } from '../components/ui';
import { money } from '../format';
import { errorMessage } from '../auth/authApi';
import { createFeedProduct, listFeedProducts, updateFeedProduct } from './feedApi';
import { ErrorBanner, Field, PrimaryButton, StockPill, fieldClass } from './ui';
import { units } from './compute';
import {
  FEED_TYPES,
  PACKAGE_TYPES,
  SPECIES,
  SPECIES_ICON,
  SPECIES_LABEL,
  UNITS_OF_MEASURE,
} from './constants';
import type {
  FeedProduct,
  FeedProductInput,
  FeedProductPatch,
  FeedType,
  PackageType,
  Species,
  UnitOfMeasure,
} from './types';

/** A new product starts as a 50 kg bag — the shape of most of the catalogue. */
const BLANK: FeedProductInput = {
  sku: '',
  name: '',
  species: 'camel',
  feed_type: 'pellet',
  brand: '',
  unit_size: 50,
  unit_of_measure: 'kg',
  package_type: 'bag',
  unit_cost: 0,
  unit_price: 0,
  shelf_life_days: 180,
  reorder_level: 0,
  notes: '',
};

function ProductForm({
  initial,
  editingSku,
  onSubmit,
  onCancel,
  saving,
}: {
  initial: FeedProductInput;
  /** Set when editing: the SKU is immutable once issued, so it renders read-only. */
  editingSku?: string;
  onSubmit: (values: FeedProductInput) => void;
  onCancel: () => void;
  saving: boolean;
}): ReactElement {
  const [values, setValues] = useState<FeedProductInput>(initial);

  const set = <K extends keyof FeedProductInput>(key: K, value: FeedProductInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // A preview of values the user has typed but not saved, so it cannot come from
  // the API (which only knows the persisted product). Saved rows always show the
  // server's `margin_pct`.
  const margin =
    values.unit_price > 0 ? ((values.unit_price - values.unit_cost) / values.unit_price) * 100 : 0;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(values);
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Identifier (SKU)" hint={editingSku ? 'Cannot be changed once issued' : 'e.g. CML-PEL-50'}>
          <input
            className={`${fieldClass} font-mono uppercase ${editingSku ? 'bg-slate-50 text-slate-500' : ''}`}
            required
            readOnly={Boolean(editingSku)}
            value={editingSku ?? values.sku}
            onChange={(e) => set('sku', e.target.value)}
            maxLength={32}
          />
        </Field>
        <Field label="Product name">
          <input
            className={fieldClass}
            required
            minLength={2}
            maxLength={120}
            value={values.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label="Livestock">
          <select
            className={fieldClass}
            value={values.species}
            onChange={(e) => set('species', e.target.value as Species)}
          >
            {SPECIES.map((s) => (
              <option key={s} value={s}>
                {SPECIES_ICON[s]} {SPECIES_LABEL[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Feed type">
          <select
            className={fieldClass}
            value={values.feed_type}
            onChange={(e) => set('feed_type', e.target.value as FeedType)}
          >
            {FEED_TYPES.map((f) => (
              <option key={f} value={f} className="capitalize">
                {f}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Brand" hint="Optional">
          <input
            className={fieldClass}
            maxLength={80}
            value={values.brand ?? ''}
            onChange={(e) => set('brand', e.target.value)}
          />
        </Field>
        <Field label="Shelf life (days)" hint="Used to derive batch expiry dates">
          <input
            className={fieldClass}
            type="number"
            required
            min={1}
            max={3650}
            value={values.shelf_life_days}
            onChange={(e) => set('shelf_life_days', Number(e.target.value))}
          />
        </Field>
      </div>

      <fieldset className="rounded-xl border border-slate-100 p-4">
        <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Package — one unit
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Size">
            <input
              className={fieldClass}
              type="number"
              required
              min={0.01}
              step="any"
              value={values.unit_size}
              onChange={(e) => set('unit_size', Number(e.target.value))}
            />
          </Field>
          <Field label="Measure">
            <select
              className={fieldClass}
              value={values.unit_of_measure}
              onChange={(e) => set('unit_of_measure', e.target.value as UnitOfMeasure)}
            >
              {UNITS_OF_MEASURE.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Package">
            <select
              className={fieldClass}
              value={values.package_type}
              onChange={(e) => set('package_type', e.target.value as PackageType)}
            >
              {PACKAGE_TYPES.map((p) => (
                <option key={p} value={p} className="capitalize">
                  {p}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          Sold as: <span className="font-semibold text-slate-600">
            {values.unit_size} {values.unit_of_measure} {values.package_type}
          </span>
        </p>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Cost per unit" hint="Standard cost; each batch records its own">
          <input
            className={fieldClass}
            type="number"
            required
            min={0}
            step="0.01"
            value={values.unit_cost}
            onChange={(e) => set('unit_cost', Number(e.target.value))}
          />
        </Field>
        <Field label="Price per unit" hint={`Margin ${margin.toFixed(1)}%`}>
          <input
            className={fieldClass}
            type="number"
            required
            min={0}
            step="0.01"
            value={values.unit_price}
            onChange={(e) => set('unit_price', Number(e.target.value))}
          />
        </Field>
        <Field label="Reorder level" hint="0 disables the low-stock alert">
          <input
            className={fieldClass}
            type="number"
            min={0}
            value={values.reorder_level}
            onChange={(e) => set('reorder_level', Number(e.target.value))}
          />
        </Field>
      </div>

      <Field label="Notes" hint="Optional — storage instructions, supplier quirks">
        <textarea
          className={fieldClass}
          rows={2}
          maxLength={500}
          value={values.notes ?? ''}
          onChange={(e) => set('notes', e.target.value)}
        />
      </Field>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-4 py-2.5 font-semibold text-slate-500 transition hover:bg-slate-100"
        >
          Cancel
        </button>
        <PrimaryButton type="submit" disabled={saving}>
          {saving ? 'Saving…' : editingSku ? 'Save changes' : 'Create product'}
        </PrimaryButton>
      </div>
    </form>
  );
}

/** Catalogue view: filter, inspect stock position, add and edit SKUs. */
export default function FeedProducts(): ReactElement {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const [rows, setRows] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [editing, setEditing] = useState<FeedProduct | null>(null);
  const [creating, setCreating] = useState(false);
  /** Bumped after a successful write to refetch the list. */
  const [reload, setReload] = useState(0);

  // Filters live in the URL so the dashboard can deep-link into a filtered view.
  const species = (params.get('species') ?? '') as Species | '';
  // May be a comma-separated set (e.g. "low,out_of_stock"), which the API accepts.
  const stockStatus = params.get('stock_status') ?? '';
  const search = params.get('q') ?? '';
  // Local mirror of the search box so typing stays responsive; the URL (and the
  // request) only follow once the user pauses. Without this every keystroke was
  // a round trip.
  const [searchDraft, setSearchDraft] = useState(search);
  const includeInactive = params.get('include_inactive') === 'true';

  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    // The handler owns the spinner — the effect below never sets state
    // synchronously, so changing a filter is what marks the list as loading.
    setLoading(true);
    setParams(next, { replace: true });
  };

  // `reload` bumps on every successful write so the list refetches; the effect
  // writes state only from the promise callbacks (never synchronously in its
  // body), and the `alive` guard drops responses from superseded filter changes.
  useEffect(() => {
    let alive = true;
    listFeedProducts({
      species,
      stock_status: stockStatus,
      q: search,
      include_inactive: includeInactive,
    })
      .then((next) => {
        if (!alive) return;
        setRows(next);
        setError('');
      })
      .catch((err) => {
        if (alive) setError(errorMessage(err, 'Could not load the product catalogue.'));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [species, stockStatus, search, includeInactive, reload]);

  // Push the draft into the URL after a short pause. Re-armed on every keystroke,
  // so only the final value of a burst is ever requested.
  useEffect(() => {
    if (searchDraft === search) return;
    const timer = setTimeout(() => setParam('q', searchDraft), 300);
    return () => clearTimeout(timer);
    // `setParam` closes over `params`, which changes with every filter edit;
    // depending on it would re-arm the timer mid-burst.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchDraft, search]);

  const totals = useMemo(
    () => ({
      cost: rows.reduce((sum, r) => sum + r.stock_value_cost, 0),
      units: rows.reduce((sum, r) => sum + r.on_hand, 0),
    }),
    [rows],
  );

  const handleCreate = async (values: FeedProductInput) => {
    setSaving(true);
    setFormError('');
    try {
      await createFeedProduct(values);
      setCreating(false);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not create the product.'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (values: FeedProductInput) => {
    if (!editing) return;
    setSaving(true);
    setFormError('');
    try {
      // Built field by field rather than spread: `sku` is immutable server-side
      // and the PATCH schema is `extra="forbid"`, so an accidental extra key
      // would fail the whole request.
      const patch: FeedProductPatch = {
        name: values.name,
        species: values.species,
        feed_type: values.feed_type,
        brand: values.brand,
        unit_size: values.unit_size,
        unit_of_measure: values.unit_of_measure,
        package_type: values.package_type,
        unit_cost: values.unit_cost,
        unit_price: values.unit_price,
        shelf_life_days: values.shelf_life_days,
        reorder_level: values.reorder_level,
        notes: values.notes,
      };
      await updateFeedProduct(editing.id, patch);
      setEditing(null);
      setLoading(true);
      setReload((n) => n + 1);
    } catch (err) {
      setFormError(errorMessage(err, 'Could not save the product.'));
    } finally {
      setSaving(false);
    }
  };

  const toInput = (product: FeedProduct): FeedProductInput => ({
    sku: product.sku,
    name: product.name,
    species: product.species,
    feed_type: product.feed_type,
    brand: product.brand ?? '',
    unit_size: product.unit_size,
    unit_of_measure: product.unit_of_measure,
    package_type: product.package_type,
    unit_cost: product.unit_cost,
    unit_price: product.unit_price,
    shelf_life_days: product.shelf_life_days,
    reorder_level: product.reorder_level,
    notes: product.notes ?? '',
  });

  return (
    <div className="p-4 sm:p-8">
      <PageHeader
        title="Products"
        subtitle={`${rows.length} products · ${units(totals.units)} units · ${money(totals.cost)} at cost`}
        actions={
          <PrimaryButton
            onClick={() => {
              setFormError('');
              setCreating(true);
            }}
          >
            + Add product
          </PrimaryButton>
        }
      />

      {error && <ErrorBanner message={error} />}

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Search</span>
          <input
            className={`${fieldClass} w-48`}
            placeholder="SKU, name or brand"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Livestock</span>
          <select
            className={`${fieldClass} w-40`}
            value={species}
            onChange={(e) => setParam('species', e.target.value)}
          >
            <option value="">All</option>
            {SPECIES.map((s) => (
              <option key={s} value={s}>
                {SPECIES_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-slate-600">Stock</span>
          <select
            className={`${fieldClass} w-40`}
            value={stockStatus}
            onChange={(e) => setParam('stock_status', e.target.value)}
          >
            <option value="">All</option>
            <option value="healthy">In stock</option>
            <option value="low,out_of_stock">Needs reordering</option>
            <option value="low">Low stock</option>
            <option value="out_of_stock">Out of stock</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setParam('include_inactive', e.target.checked ? 'true' : '')}
          />
          Show retired
        </label>
      </div>

      {loading ? (
        <Loading label="Loading products…" />
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-100 bg-white p-8 text-center text-slate-400">
          No products match these filters.
        </p>
      ) : (
        <div className="rounded-2xl border border-slate-100 bg-white p-2 shadow-sm sm:p-4">
          <TableScroll minWidth="min-w-[900px]">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                  <th className="py-2 pr-3 font-semibold">Product</th>
                  <th className="py-2 pr-3 font-semibold">Unit</th>
                  <th className="py-2 pr-3 text-right font-semibold">On hand</th>
                  <th className="py-2 pr-3 text-right font-semibold">Cost</th>
                  <th className="py-2 pr-3 text-right font-semibold">Price</th>
                  <th className="py-2 pr-3 text-right font-semibold">Margin</th>
                  <th className="py-2 pr-3 text-right font-semibold">Stock value</th>
                  <th className="py-2 pr-3 font-semibold">Status</th>
                  <th className="py-2 font-semibold" />
                </tr>
              </thead>
              <tbody>
                {rows.map((product) => (
                  <tr
                    key={product.id}
                    onClick={() => navigate(`/feed/products/${product.id}`)}
                    className={`cursor-pointer border-b border-slate-50 transition last:border-0 hover:bg-slate-50 ${
                      product.is_active ? '' : 'opacity-50'
                    }`}
                  >
                    <td className="py-3 pr-3">
                      <div className="font-semibold text-slate-800">{product.name}</div>
                      <div className="font-mono text-xs text-slate-400">
                        {SPECIES_ICON[product.species]} {product.sku}
                        {product.brand ? ` · ${product.brand}` : ''}
                      </div>
                    </td>
                    <td className="py-3 pr-3 text-slate-500">{product.unit_label}</td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      <div className="font-semibold">{units(product.on_hand)}</div>
                      {product.expired_units > 0 && (
                        <div className="text-xs text-red-500">
                          {units(product.expired_units)} expired
                        </div>
                      )}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                      {money(product.unit_cost)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums text-slate-500">
                      {money(product.unit_price)}
                    </td>
                    <td className="py-3 pr-3 text-right tabular-nums">
                      <span className={product.margin_pct >= 20 ? 'text-green-700' : 'text-amber-600'}>
                        {product.margin_pct}%
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right font-semibold tabular-nums">
                      {money(product.stock_value_cost)}
                    </td>
                    <td className="py-3 pr-3">
                      <StockPill status={product.stock_status} />
                    </td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFormError('');
                          setEditing(product);
                        }}
                        className="text-xs font-semibold text-slate-400 transition hover:text-[#3f7d3f]"
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="Add product">
        {formError && <ErrorBanner message={formError} />}
        <ProductForm
          initial={BLANK}
          onSubmit={handleCreate}
          onCancel={() => setCreating(false)}
          saving={saving}
        />
      </Modal>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing ? `Edit ${editing.sku}` : ''}
        subtitle={editing?.name}
      >
        {formError && <ErrorBanner message={formError} />}
        {editing && (
          <ProductForm
            initial={toInput(editing)}
            editingSku={editing.sku}
            onSubmit={handleUpdate}
            onCancel={() => setEditing(null)}
            saving={saving}
          />
        )}
      </Modal>
    </div>
  );
}
