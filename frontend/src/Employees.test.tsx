// @vitest-environment jsdom
/**
 * Tests for the Employees component and AddEmployeeModal.
 *
 * Coverage:
 *  - Renders the employee roster after listUsers resolves.
 *  - Shows the empty-state string when there are no employees.
 *  - Clicking "Add Employee" opens the modal.
 *  - The role <select> inside the modal exposes ONLY manager and maintenance
 *    options — the backend allow-list mirrors this, blocking privilege escalation.
 *  - After createUser succeeds, the modal switches to the OTP display view.
 *  - When createUser rejects, an error message is shown.
 *
 * Strategy: mock ./data/api so no network calls are made.  Language is forced
 * to English in beforeEach so assertion strings are predictable.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

// vi.mock is hoisted before imports, so this intercepts Employees.tsx's import.
vi.mock('./data/api', () => ({
  listUsers: vi.fn(),
  createUser: vi.fn(),
}));

import Employees from './Employees';
import * as dataApi from './data/api';
import { useAuthStore } from './authStore';
import { useLangStore, DEFAULT_LANG } from './i18n/store';

const mockListUsers = vi.mocked(dataApi.listUsers);
const mockCreateUser = vi.mocked(dataApi.createUser);

// Seed the auth store with an actor carrying the given permissions so the
// component's hasPermission('admin') gate resolves. Admins may assign
// manager/maintenance; plain managers may assign only maintenance.
function setActor(permissions: string[]) {
  useAuthStore.setState({
    token: 'test-token',
    user: {
      id: 99,
      email: 'actor@harmaal.io',
      role: permissions.includes('admin') ? 'admin' : 'manager',
      display_name: 'Actor',
      phone: null,
      is_active: true,
      is_system: false,
      totp_enabled: false,
      must_change_password: false,
      is_otp: false,
      permissions,
      roles: [],
    },
  });
}

// Minimal shape that satisfies the component's AdminUserRow usage.
interface StubUser {
  id: number;
  email: string;
  role: string;
  display_name: string | null;
  phone?: string | null;
  is_active: boolean;
  totp_enabled: boolean;
  permissions: string[];
  roles: { id: number; name: string }[];
}

const makeUser = (overrides: Partial<StubUser> = {}): StubUser => ({
  id: 1,
  email: 'mgr@harmaal.io',
  role: 'manager',
  display_name: 'Test Manager',
  phone: null,
  is_active: true,
  totp_enabled: false,
  permissions: ['manage_staff'],
  roles: [{ id: 4, name: 'manager' }],
  ...overrides,
});

beforeEach(() => {
  // English text is clearer in assertions than Somali.
  useLangStore.setState({ lang: 'en' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useLangStore.setState({ lang: DEFAULT_LANG });
  useAuthStore.setState({ token: null, user: null });
  localStorage.clear();
});

// ---------------------------------------------------------------------------
// Roster rendering
// ---------------------------------------------------------------------------

describe('Employees roster', () => {
  it('renders each employee display_name after loading', async () => {
    mockListUsers.mockResolvedValue([
      makeUser({ id: 1, display_name: 'Alice', email: 'alice@harmaal.io' }),
      makeUser({ id: 2, display_name: 'Bob', email: 'bob@harmaal.io', role: 'maintenance' }),
    ] as StubUser[]);
    render(<Employees />);
    await waitFor(() => screen.getByText('Alice'));
    expect(screen.getByText('Bob')).toBeDefined();
  });

  it('shows a phone number beneath the display name when phone is set', async () => {
    mockListUsers.mockResolvedValue([
      makeUser({ display_name: 'Dana', phone: '+252631234567' }),
    ] as StubUser[]);
    render(<Employees />);
    await waitFor(() => screen.getByText('+252631234567'));
  });

  it('shows the empty-state message when no employees exist', async () => {
    mockListUsers.mockResolvedValue([] as StubUser[]);
    render(<Employees />);
    await waitFor(() =>
      screen.getByText('No employees yet. Add your first staff member.'),
    );
  });
});

// ---------------------------------------------------------------------------
// Modal: open + role select guard
// ---------------------------------------------------------------------------

describe('AddEmployeeModal', () => {
  beforeEach(() => {
    mockListUsers.mockResolvedValue([] as StubUser[]);
    // Default actor for the modal tests is a full admin (may assign both roles).
    setActor(['admin', 'manage_staff']);
  });

  async function openModal() {
    render(<Employees />);
    await waitFor(() =>
      screen.getByText('No employees yet. Add your first staff member.'),
    );
    fireEvent.click(screen.getByText('+ Add Employee'));
  }

  it('clicking Add Employee opens the modal form', async () => {
    await openModal();
    expect(screen.getByText('Add Employee')).toBeDefined();
  });

  it('admin role select offers manager and maintenance only (no privileged roles)', async () => {
    await openModal();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['manager', 'maintenance']);
    // Explicitly assert dangerous roles are absent.
    expect(values).not.toContain('admin');
    expect(values).not.toContain('owner');
    expect(values).not.toContain('tenant');
  });

  it('non-admin manager can only assign maintenance (cannot mint manager peers)', async () => {
    setActor(['manage_staff']); // manager: manage_staff without admin
    await openModal();
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values).toEqual(['maintenance']);
    expect(values).not.toContain('manager');
  });

  it('shows the generated OTP after successful creation', async () => {
    const otp = 'AbCd1234!XyZ9ef';
    mockCreateUser.mockResolvedValue({
      user: makeUser({ email: 'new@harmaal.io' }) as StubUser,
      generated_otp: otp,
    });

    await openModal();

    fireEvent.change(screen.getByPlaceholderText('email@harmaal.com'), {
      target: { value: 'new@harmaal.io' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => screen.getByText(otp));
    // The OTP view title should also appear.
    expect(screen.getByText('Employee created')).toBeDefined();
  });

  it('createUser is called with the submitted email and selected role', async () => {
    mockCreateUser.mockResolvedValue({
      user: makeUser({ email: 'sub@harmaal.io' }) as StubUser,
      generated_otp: 'TestOTP123!Ab',
    });

    await openModal();

    fireEvent.change(screen.getByPlaceholderText('email@harmaal.com'), {
      target: { value: 'sub@harmaal.io' },
    });
    // Default role is 'manager'; change to 'maintenance' to verify the select.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'maintenance' } });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() => expect(mockCreateUser).toHaveBeenCalledTimes(1));
    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'sub@harmaal.io', role: 'maintenance' }),
    );
  });

  it('shows an error message when createUser rejects', async () => {
    mockCreateUser.mockRejectedValue(new Error('conflict'));

    await openModal();

    fireEvent.change(screen.getByPlaceholderText('email@harmaal.com'), {
      target: { value: 'fail@harmaal.io' },
    });
    fireEvent.click(screen.getByText('Create'));

    await waitFor(() =>
      screen.getByText('Could not create employee (email may already exist).'),
    );
  });

  it('Cancel button closes the modal', async () => {
    await openModal();
    fireEvent.click(screen.getByText('Cancel'));
    // The modal title should disappear.
    expect(screen.queryByText('Add Employee')).toBeNull();
  });

  it('Done button on the OTP view closes the modal', async () => {
    mockCreateUser.mockResolvedValue({
      user: makeUser() as StubUser,
      generated_otp: 'DoneOTP9!Test',
    });

    await openModal();
    fireEvent.change(screen.getByPlaceholderText('email@harmaal.com'), {
      target: { value: 'done@harmaal.io' },
    });
    fireEvent.click(screen.getByText('Create'));
    await waitFor(() => screen.getByText('Done'));

    act(() => {
      fireEvent.click(screen.getByText('Done'));
    });
    expect(screen.queryByText('Employee created')).toBeNull();
  });
});
