import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { FeedGuard, FeedShell } from './FeedShell';
import FeedLogin from './FeedLogin';
import FeedDashboard from './FeedDashboard';
import FeedProducts from './FeedProducts';
import FeedProductDetail from './FeedProductDetail';
import FeedInventory from './FeedInventory';
import FeedMovements from './FeedMovements';

/**
 * Hormaal Animal Feed — the whole console, mounted under `/feed/*`.
 *
 * Kept as one nested router (rather than flat routes in `App.tsx`) so the entire
 * module — pages, charts and recharts — ships as a single lazy chunk that a
 * property-app user never downloads.
 */

/** Wrap a page in the guard and the feed shell. */
function Protected({ children }: { children: ReactElement }): ReactElement {
  return (
    <FeedGuard>
      <FeedShell>{children}</FeedShell>
    </FeedGuard>
  );
}

export default function FeedApp(): ReactElement {
  return (
    <Routes>
      {/* The only public route in this module. */}
      <Route path="login" element={<FeedLogin />} />

      <Route
        index
        element={
          <Protected>
            <FeedDashboard />
          </Protected>
        }
      />
      <Route
        path="products"
        element={
          <Protected>
            <FeedProducts />
          </Protected>
        }
      />
      <Route
        path="products/:id"
        element={
          <Protected>
            <FeedProductDetail />
          </Protected>
        }
      />
      <Route
        path="inventory"
        element={
          <Protected>
            <FeedInventory />
          </Protected>
        }
      />
      <Route
        path="movements"
        element={
          <Protected>
            <FeedMovements />
          </Protected>
        }
      />

      {/* Anything else under /feed lands on the dashboard (or its sign-in page). */}
      <Route
        path="*"
        element={
          <Protected>
            <FeedDashboard />
          </Protected>
        }
      />
    </Routes>
  );
}
