// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { FilterBar } from './FilterBar';

// No global test setup file, so unmount between tests to avoid DOM accumulation.
afterEach(cleanup);
import type { Property, Tenant } from '../../data/types';
import type { FilterState } from '../filters';

const properties: Property[] = [
  { id: 1, address: '1 Main St', units: 4, description: null, owner_id: 1, tenants: [] },
  { id: 2, address: '2 Oak Ave', units: 4, description: null, owner_id: 1, tenants: [] },
];

const tenant = (over: Partial<Tenant>): Tenant => ({
  id: 1,
  name: 'Amina',
  email: 'a@x.com',
  rent_amount: 1000,
  lease_start_date: '2025-01-01',
  lease_end_date: '2026-12-31',
  unit_label: 'A-1',
  property_id: 1,
  user_id: null,
  payments: [],
  ...over,
});

const base: FilterState = {
  preset: 'last_12',
  from: '2026-01',
  to: '2026-12',
  propertyId: 'all',
  tenantId: 'all',
};

describe('FilterBar', () => {
  it('clicking a preset calls onChange with that preset + a resolved range', () => {
    const onChange = vi.fn();
    render(<FilterBar filters={base} onChange={onChange} properties={properties} tenants={[]} />);
    fireEvent.click(screen.getByText('This year'));
    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as FilterState;
    expect(next.preset).toBe('this_year');
    expect(next.from).toMatch(/^\d{4}-01$/);
    expect(next.to).toMatch(/^\d{4}-12$/);
  });

  it('selecting a property calls onChange with its numeric id', () => {
    const onChange = vi.fn();
    render(<FilterBar filters={base} onChange={onChange} properties={properties} tenants={[]} />);
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '2' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 2 }));
  });

  it('choosing a property resets a tenant that belongs to a different property', () => {
    const onChange = vi.fn();
    const tenants = [tenant({ id: 5, name: 'Bilal', property_id: 2 })];
    render(
      <FilterBar filters={{ ...base, tenantId: 5 }} onChange={onChange} properties={properties} tenants={tenants} />,
    );
    // Select property 1 while tenant 5 belongs to property 2 → tenant must reset.
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ propertyId: 1, tenantId: 'all' }));
  });

  it('custom preset reveals two month-range inputs', () => {
    const onChange = vi.fn();
    render(
      <FilterBar filters={{ ...base, preset: 'custom' }} onChange={onChange} properties={properties} tenants={[]} />,
    );
    expect(document.querySelectorAll('input[type="month"]').length).toBe(2);
  });

  it('tenant dropdown narrows to the selected property', () => {
    const onChange = vi.fn();
    const tenants = [
      tenant({ id: 5, name: 'Bilal', property_id: 2 }),
      tenant({ id: 6, name: 'Cara', property_id: 1 }),
    ];
    render(
      <FilterBar filters={{ ...base, propertyId: 1 }} onChange={onChange} properties={properties} tenants={tenants} />,
    );
    expect(screen.queryByText('Cara')).not.toBeNull(); // belongs to property 1
    expect(screen.queryByText('Bilal')).toBeNull(); // property 2 — excluded
  });
});
