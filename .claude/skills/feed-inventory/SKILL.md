---
name: feed-inventory
description: Work on the Hormaal Animal Feed inventory module (products, batches/lots, FEFO stock movements, expiry tracking, dashboard). Use when adding, changing, or debugging anything under /feed.
---

# /feed-inventory

Extend or debug the **Hormaal Animal Feed** console — the group's second company.

## Usage
- `/feed-inventory add a supplier table` — plan and implement a change
- `/feed-inventory why is stock on hand wrong for SKU X` — debug a stock discrepancy

## Read first
`.claude/rules/feed-inventory.md` — the seven stock invariants. Most bugs in this
module are an invariant that got quietly broken; most bad changes are one that got
"optimized" away.

## Where things live
| Concern | File |
|---|---|
| Pure domain logic (FEFO, expiry, valuation) | `services/api/src/api/internal/feed_inventory.py` |
| Endpoints, persistence, HTTP status codes | `services/api/src/api/routers/feed.py` |
| Request/response schemas | "Hormaal Animal Feed" section of `models/schemas.py` |
| Tables | `models/orm.py` (`FeedProduct`/`FeedBatch`/`FeedStockMovement`) |
| Schema history | `shared/migrations/versions/0007_feed_inventory.py` |
| Demo dataset | `build_feed()` in `services/api/src/api/mock_data.py` |
| UI | `frontend/src/feed/` (`FeedApp.tsx` routes the module) |
| Tests | `services/api/tests/test_feed_inventory.py`, `frontend/src/feed/*.test.*` |

## Working rules
1. **Business rules go in `feed_inventory.py`**, as pure functions with a passed-in
   `today`. If you find yourself writing expiry or allocation logic inside the router
   or a React component, move it.
2. **Never derive a business number in TypeScript.** `stock_status`, `expiry_status`,
   `margin_pct`, `sellable_units` all come from the API. `feed/compute.ts` formats;
   it does not decide.
3. **Schema change → migration.** Real `downgrade()`, round-tripped
   (`upgrade head` → `downgrade -1` → `upgrade head`) against the compose DB.
4. **New vocabulary value** → Python tuple, then the TS union, then the label map.
   Three places, in that order.
5. **Guard every route** with `RequirePermission("manage_feed")` and give it a
   `response_model`.

## Debugging stock discrepancies
Stock on hand is `sum(batch.quantity_remaining)` and the ledger is append-only, so the
two must reconcile. To find where they diverged:

```sql
-- Per product: lot balance vs. what the ledger says it should be.
SELECT p.sku,
       (SELECT COALESCE(SUM(b.quantity_remaining), 0) FROM feed_batches b WHERE b.product_id = p.id) AS lots,
       (SELECT COALESCE(SUM(m.quantity), 0) FROM feed_stock_movements m WHERE m.product_id = p.id) AS ledger
FROM feed_products p
ORDER BY p.sku;
```
Any row where `lots <> ledger` means a write path mutated a lot without booking a
movement (or vice versa) — that is the bug, not the reporting.

## Verify
```bash
cd services/api && .venv/bin/pytest tests/test_feed_inventory.py -q && ruff check src tests
cd frontend && npm run lint && npm run build && npm test
```
