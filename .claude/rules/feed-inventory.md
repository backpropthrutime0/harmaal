# Hormaal Animal Feed — inventory rules

The second Hormaal Group company in this repo. Backend: `services/api/src/api/routers/feed.py`
+ `internal/feed_inventory.py`. Frontend: `frontend/src/feed/`. Schema: migration `0007`.

## Layering (do not blur it)
- `internal/feed_inventory.py` is **pure**: no DB, no I/O, no clock reads except a
  `today` argument the caller passes in. FEFO allocation, expiry classification,
  shelf-life derivation, bucketing and valuation ratios live there and are unit-tested
  directly.
- `routers/feed.py` owns persistence and HTTP. It may not re-implement a rule that
  `feed_inventory` already expresses.
- The frontend's `feed/compute.ts` is presentation only — formatting and ordering.
  **Never** re-derive a business number (stock status, expiry status, margin) in TS;
  the API already returns it.

## Stock invariants
These are the reasons the module exists. Any change must preserve all of them.

1. **Stock on hand is derived, never stored.** It is always
   `sum(batch.quantity_remaining)`. Do not add an `on_hand` column to `feed_products`
   — a denormalized copy is how the books and the shelf start to disagree.
2. **Outbound movements draw FEFO** (first-expiry-first-out) across lots, one ledger
   row per lot touched, each costed at *that lot's* `unit_cost`. Landed cost moves
   between shipments, so COGS must come from the lot, not the product.
3. **Expired lots cannot be sold.** `sale` skips them; only `write_off` can clear
   them. This is a food-safety rule, not a nicety — do not "fix" a 409 by relaxing it.
4. **Reorder alerts use `sellable_units`, not `on_hand`.** Expired feed is on the
   shelf and carries cost, but it is not cover. Counting it would silently suppress
   the reorder signal for a product that has effectively run out.
5. **Inbound corrections (`return`, positive `adjustment`) must name a `batch_id`**,
   and can never push a lot above its `quantity_received`.
6. **The ledger is append-only.** No update, no delete. A mistake is corrected with a
   compensating movement. Do not add a PATCH/DELETE for `feed_stock_movements`.
7. **Quantities are whole packages.** One "50 kg bag" is one unit. Never store weights.
8. **Retiring is retiring, whichever door.** A SKU with stock on hand cannot be
   deactivated — not by `DELETE`, and not by a `PATCH` setting `is_active: false`.
   Retired products drop out of every dashboard total, so retiring one with stock
   would write that inventory out of the books.
9. **Every dashboard figure spans the same population.** Totals, expiry figures,
   buckets and the `_pct` fields are all computed over *active* products. Mixing
   populations produced ratios above 100%; `sum(expiry_buckets[*].units)` must
   equal `total_units`.

## Concurrency
Allocating stock is read-check-write against `quantity_remaining`, and SQLAlchemy
writes it as an absolute `UPDATE`. `create_movement` therefore takes row locks via
`_lock_lots()` (`SELECT … FOR UPDATE` + `populate_existing`) **before** the first
read; without it two concurrent sales both pass the sufficiency check and the
second overwrites the first, silently overselling a lot. `feed_batches` also
carries two CHECK constraints (`quantity_remaining >= 0` and
`<= quantity_received`) as the database-level backstop. SQLite (tests) has no row
locks and ignores `FOR UPDATE` — harmless, since it serializes at the database
level anyway.

Any new endpoint that mutates lot quantities must take the same locks.

## Vocabularies
`SPECIES`, `FEED_TYPES`, `UNITS_OF_MEASURE`, `PACKAGE_TYPES`, `MOVEMENT_TYPES` in
`internal/feed_inventory.py` are the single source of truth. Extending one means:
1. add the value there, 2. extend the union in `frontend/src/feed/types.ts`,
3. add the label/tone in `frontend/src/feed/constants.ts`. Schemas validate against
the Python tuples, so step 1 alone is what makes a value legal.

## Access control
Every `/feed` route is guarded by `RequirePermission("manage_feed")`. The permission
is seeded onto the `admin` role only, matching the console's admin-only sign-in page.
Because `seed.py` reconciles the admin role to hold every permission, adding a new
feed permission can never lock admins out — but note permissions ride in the JWT, so
a grant applies at the affected user's **next sign-in**.

The frontend guard is `FeedGuard` in `frontend/src/feed/FeedShell.tsx` — deliberately
separate from the property app's `PrivateRoute` so an unauthorized visitor lands on
`/feed/login`, not the property sign-in page.

## Dates
Stored as ISO `YYYY-MM-DD` **strings**, matching the rent/expense ledger. That makes
lexicographic comparison chronological, which the movement date filters rely on.
Parse with `feed_inventory.parse_date` (returns `None` on junk — reports must never
raise on a malformed legacy row).

## Adding to the module
- New endpoint → `routers/feed.py`, guarded by `ManageFeed`, with a `response_model`.
- New schema → the "Hormaal Animal Feed" section of `models/schemas.py`,
  `extra="forbid"` on requests.
- Schema change → an Alembic migration with a real `downgrade()` (see `0007`), plus
  the matching TS type in `feed/types.ts`.
- New page → `frontend/src/feed/`, routed inside `FeedApp.tsx` so it stays in the one
  lazy chunk a property-app user never downloads.
- **Filter before you limit.** `expiry_status` and friends are pushed into SQL; a
  Python filter applied after `.limit()` silently returns a short page.
- **Bound analytics queries by date, not row count.** A row cap makes a chart drop
  data without saying so.
