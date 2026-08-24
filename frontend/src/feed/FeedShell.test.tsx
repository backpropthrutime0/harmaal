// @vitest-environment jsdom
/**
 * Access-control tests for the Animal Feed console shell.
 *
 * The `manage_feed` permission is enforced server-side on every `/feed`
 * endpoint — `FeedGuard` is the UX half of that rule, and these tests pin the
 * behaviour that matters:
 *
 *  - An anonymous visitor is sent to the feed's own sign-in page, never the
 *    property app's `/login`.
 *  - A *signed-in* user without `manage_feed` is also turned away: holding a
 *    valid session for another Hormaal Group product must not open this one.
 *  - An admin-issued one-time password is rotated before anything else.
 *  - A holder of `manage_feed` gets through.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { FeedGuard } from './FeedShell';
import { useAuthStore, type AuthUser } from '../authStore';

afterEach(cleanup);

/** A token whose `exp` is far in the future, so `isAuthenticated()` passes. */
function futureToken(): string {
  const payload = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  return `header.${payload}.signature`;
}

function signIn(permissions: string[], overrides: Partial<AuthUser> = {}) {
  useAuthStore.setState({
    token: futureToken(),
    user: {
      id: 1,
      email: 'admin@harmaal.local',
      role: 'admin',
      display_name: 'Root Admin',
      is_active: true,
      is_system: true,
      totp_enabled: false,
      must_change_password: false,
      is_otp: false,
      permissions,
      roles: [{ id: 1, name: 'admin' }],
      ...overrides,
    },
  });
}

function signOut() {
  useAuthStore.setState({ token: null, user: null });
}

/**
 * Stand-in for the shared change-password screen that reports the origin it was
 * handed, so the test can assert the round trip returns to the feed console.
 */
function ChangePasswordProbe() {
  const state = useLocation().state as { from?: string } | null;
  return <div>Change password from {state?.from ?? 'nowhere'}</div>;
}

/** Render the guard inside a router that reports where it redirected to. */
function renderGuard(initial = '/feed') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route
          path="/feed"
          element={
            <FeedGuard>
              <div>Inventory dashboard</div>
            </FeedGuard>
          }
        />
        <Route path="/feed/login" element={<div>Feed sign-in</div>} />
        <Route path="/login" element={<div>Property sign-in</div>} />
        <Route path="/change-password" element={<ChangePasswordProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(signOut);

describe('FeedGuard', () => {
  it('sends an anonymous visitor to the feed sign-in page', () => {
    renderGuard();
    expect(screen.getByText('Feed sign-in')).toBeTruthy();
    expect(screen.queryByText('Inventory dashboard')).toBeNull();
  });

  it('never bounces a feed visitor to the property sign-in page', () => {
    renderGuard();
    expect(screen.queryByText('Property sign-in')).toBeNull();
  });

  it('turns away a signed-in user who lacks manage_feed', () => {
    // A property manager holds a perfectly valid session — for a different
    // company. That must not open the feed console.
    signIn(['manage_properties', 'manage_tenants'], { role: 'manager' });
    renderGuard();
    expect(screen.getByText('Feed sign-in')).toBeTruthy();
    expect(screen.queryByText('Inventory dashboard')).toBeNull();
  });

  it('forces a one-time password to be rotated first, and remembers where from', () => {
    // The origin has to travel with the redirect: the shared change-password
    // screen otherwise finishes by sending the user to the *property* app's
    // sign-in page — the one flow that escapes /feed.
    signIn(['manage_feed'], { must_change_password: true });
    renderGuard();
    expect(screen.getByText('Change password from /feed')).toBeTruthy();
  });

  it('lets a manage_feed holder through', () => {
    signIn(['manage_feed']);
    renderGuard();
    expect(screen.getByText('Inventory dashboard')).toBeTruthy();
  });

  it('treats an expired token as signed out', () => {
    const expired = btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 }));
    useAuthStore.setState({
      token: `header.${expired}.signature`,
      user: {
        id: 1,
        email: 'admin@harmaal.local',
        role: 'admin',
        display_name: 'Root Admin',
        is_active: true,
        is_system: true,
        totp_enabled: false,
        must_change_password: false,
        is_otp: false,
        permissions: ['manage_feed'],
        roles: [],
      },
    });
    renderGuard();
    expect(screen.getByText('Feed sign-in')).toBeTruthy();
  });
});
