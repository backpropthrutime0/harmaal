import type { ReactElement } from 'react';
import type { Property, Tenant } from '../../data/types';
import type { DatePreset, FilterState } from '../filters';
import { propertyOptions, resolveRange, tenantOptions } from '../filters';

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: 'this_month', label: 'This month' },
  { value: 'this_year', label: 'This year' },
  { value: 'last_12', label: 'Last 12 mo' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom' },
];

const selectClass =
  'w-full sm:w-auto rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:ring-2 focus:ring-blue-500 outline-none';

/**
 * Sticky global filter bar: date preset (+ custom month range), property and
 * tenant dropdowns. Choosing a property resets the tenant selection when the
 * current tenant no longer belongs to it.
 */
export function FilterBar({
  filters,
  onChange,
  properties,
  tenants,
}: {
  filters: FilterState;
  onChange: (next: FilterState) => void;
  properties: Property[];
  tenants: Tenant[];
}): ReactElement {
  const setPreset = (preset: DatePreset) => {
    if (preset === 'custom') {
      onChange({ ...filters, preset });
      return;
    }
    const { from, to } = resolveRange(preset);
    onChange({ ...filters, preset, from, to });
  };

  const setProperty = (propertyId: number | 'all') => {
    // Reset the tenant if it doesn't belong to the newly-selected property.
    let tenantId = filters.tenantId;
    if (propertyId !== 'all' && tenantId !== 'all') {
      const t = tenants.find((x) => x.id === tenantId);
      if (!t || t.property_id !== propertyId) tenantId = 'all';
    }
    onChange({ ...filters, propertyId, tenantId });
  };

  return (
    <div className="sticky top-0 z-10 -mx-4 sm:mx-0 mb-6 border-b border-slate-200 bg-harmaal-sand/95 px-4 py-3 backdrop-blur sm:rounded-2xl sm:border sm:px-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Date presets */}
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.value}
              onClick={() => setPreset(p.value)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                filters.preset === p.value
                  ? 'bg-harmaal-blue text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        {/* Property + tenant selects */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <select
            className={selectClass}
            value={String(filters.propertyId)}
            onChange={(e) =>
              setProperty(e.target.value === 'all' ? 'all' : Number(e.target.value))
            }
          >
            {propertyOptions(properties).map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={String(filters.tenantId)}
            onChange={(e) =>
              onChange({
                ...filters,
                tenantId: e.target.value === 'all' ? 'all' : Number(e.target.value),
              })
            }
          >
            {tenantOptions(tenants, filters.propertyId).map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Custom month range */}
      {filters.preset === 'custom' && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Range</span>
          <input
            type="month"
            value={filters.from === '0000-01' ? '' : filters.from}
            onChange={(e) => onChange({ ...filters, from: e.target.value || '0000-01' })}
            className={selectClass}
          />
          <span className="text-slate-400">→</span>
          <input
            type="month"
            value={filters.to === '9999-12' ? '' : filters.to}
            onChange={(e) => onChange({ ...filters, to: e.target.value || '9999-12' })}
            className={selectClass}
          />
        </div>
      )}
    </div>
  );
}
