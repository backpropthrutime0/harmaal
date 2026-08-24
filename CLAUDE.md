# Hormaal Group — Project Guide

A **Hormaal Group** monorepo: one FastAPI backend and one React SPA serving several of
the group's operating companies, sharing a single identity store and RBAC layer.

**Companies in the codebase**
1. **Property management** (internal brand: *Harmaal*) — owners/managers manage
   **properties**, their **tenants** (leases) and **rent payments**; an **admin**
   manages users and views business intelligence; **tenants** get a self-service portal.
2. **Hormaal Animal Feed** — admin-only inventory console for camel/cattle/goat/poultry
   feed: catalogue, batch (lot) receiving with expiry tracking, FEFO stock movements,
   costing and margin analytics. See `.claude/rules/feed-inventory.md`.

Four further companies (Construction, Logistics, Trading, Energy) appear on the group
landing page as *coming soon* placeholders and have no product behind them yet.

> **Spelling:** the group brand is **Hormaal**; the property product's internal brand is
> **Harmaal** (package names, `TOTP_ISSUER`, seeded `@harmaal.local` emails, the
> `harmaal-*` Tailwind tokens). Customer-facing copy on the group hub and the feed
> console uses *Hormaal*. Renaming the property internals is deliberately out of scope.

## Tech stack
- **Backend** (`services/api/`): Python 3.12, FastAPI (async), SQLAlchemy 2.0 (async + asyncpg), Alembic, Pydantic v2, PyJWT, bcrypt, pyotp. Layout: `src/api/{main,config,db,seed}.py`, `models/{orm,schemas}.py`, `internal/{auth,password_validation,feed_inventory}.py`, `routers/{auth,properties,tenants,feed}.py`.
- **Frontend** (`frontend/`): React 19, TypeScript (strict), Vite, Tailwind CSS, zustand, axios. Company modules are lazy-loaded chunks: `src/analytics/` (property BI) and `src/feed/` (Animal Feed console).
- **DB**: PostgreSQL. Migrations in `shared/migrations/`.
- **Infra**: Docker Compose (`db`, `backend`), Vite dev server for the frontend.

## Architecture notes
- **Public routing**: `/` is the **Hormaal Group** hub (`src/GroupLanding.tsx`) with a
  card per company. The property landing moved to `/property-management`. The Animal
  Feed console is mounted at `/feed/*` with its own shell, sign-in page and lazy chunk.
- **One identity store, many products.** Companies are separated by *permission*, not by
  database: `manage_feed` gates the feed console the same way `view_business` gates
  analytics. A 401 inside `/feed` returns the user to `/feed/login`, not `/login`
  (see `loginPathFor` in `src/api.ts`).
- **Single unified `users` table** (admin/owner/tenant) with auth/2FA/lockout columns + **RBAC** via `roles`/`permissions` join tables. Coarse `role` drives routing; fine-grained `permissions` drive `RequirePermission`.
- **Auth** (`/auth`): password login → optional **TOTP 2FA** (`mfa_required` → `/auth/verify-2fa`). JWT (HS256). DB-backed lockout (5 fails → 15 min). Strong password policy. Admin-created users get a one-time password and `must_change_password`.
- **Config**: everything via `api.config.settings` (pydantic-settings, reads `.env`). No hardcoded secrets. `ENVIRONMENT` defaults to **`production`** (strict) — see Security.

## Common commands
```bash
# Backend (Docker)
docker compose up -d db backend         # Postgres + API on :8000 (runs migrations on boot)
docker compose logs -f backend

# Backend (local, against the compose DB)
cd services/api && pip install -e ".[dev]"
ENVIRONMENT=development PYTHONPATH=src AUTO_CREATE_TABLES=true uvicorn api.main:app --reload   # quick dev w/o alembic
cd services/api && pytest -q
cd services/api && ruff check src tests && ruff format src tests

# Migrations
alembic -c shared/migrations/alembic.ini upgrade head

# Frontend
cd frontend && npm install && npm run dev    # http://localhost:5173
cd frontend && npx tsc --noEmit && npm run build
cd frontend && npm test                      # vitest (jsdom via per-file docblock)
cd frontend && npm run lint                  # eslint (CI-enforced; must stay clean)
```
Note: `npx tsc --noEmit` at the frontend root is a **no-op** (the root tsconfig is a
solution file with project references and no `files`). Use `npm run build` / `npx tsc -b`
for a real typecheck.

## Coding standards
- Backend: type hints; `async def` endpoints; `await` all DB calls; eager-load (`selectinload`) anything you serialize (avoid `MissingGreenlet`). Request schemas `extra="forbid"`; every endpoint has `response_model`. Guard routes with `get_current_user` / `RequireRole` / `RequirePermission`.
- Frontend: strict TS, named exports, all HTTP through `src/api.ts`, auth state via `authStore`, Tailwind for styling. React 19 → use `ReactElement` (no global `JSX`).
- Frontend effects must not call `setState` synchronously (eslint `react-hooks/set-state-in-effect`): fetch in the effect and write state only from the promise callbacks, with an `alive` guard; let the *event handler* that changed the inputs own the spinner.
- See `.claude/rules/` for security-hardening, alembic, TS/React, and feed-inventory rules.

## Security
- **Fail-closed config**: `ENVIRONMENT` defaults to `production`, and `Settings` refuses to construct when `JWT_SECRET` / `ROOT_PASSWORD` / the DB password are still the shipped defaults. The only exemption is `settings.is_local_dev` — `ENVIRONMENT=development` **and** every `CORS_ORIGINS`/`FRONTEND_URL` host is loopback. Bind address is not used as the signal (a container always binds `0.0.0.0`). Demo seeding is gated on the same property, since `mock_data.py`'s passwords are public. Running the API outside Docker needs an explicit `ENVIRONMENT=development`.
- JWT HS256 only; MFA-stage tokens can't access the API. TOTP `valid_window=1`; secret returned only at setup (Core scope: stored plaintext — harden with pgcrypto later). bcrypt + dummy-hash timing defense. Never serialize `hashed_password`/`totp_secret`. CORS limited to `settings.cors_origins`.

## Key endpoints
`POST /auth/register` · `POST /auth/login` · `POST /auth/verify-2fa` · `POST /auth/setup-totp` · `POST /auth/confirm-totp` · `DELETE /auth/totp` · `POST /auth/change-password` · `GET /auth/me` · `GET/POST /auth/users` (perm `manage_staff` or `admin`; non-admins may only create/see staff roles) · `GET /auth/roles` · `GET /auth/permissions` · `PUT /auth/roles/{id}/permissions` · `PUT /auth/users/{id}/roles` (all perm `admin`) · property/tenant/payment CRUD · `GET /business/summary` (perm `view_business`) · `GET /tenants/me` (tenant portal).

**Hormaal Animal Feed** (all perm `manage_feed`): `GET /feed/dashboard` ·
`GET/POST /feed/products` · `GET/PATCH/DELETE /feed/products/{id}` ·
`GET/POST /feed/batches` · `GET/POST /feed/movements`.

## Staff onboarding & i18n
- **Employees** (`/employees`, perm `manage_staff`): managers onboard employees. Non-admins may only *create* `maintenance` (`STAFF_ASSIGNABLE_ROLES` in `routers/auth.py`) — only admins mint `manager` peers — but may *view* both staff roles (`STAFF_VISIBLE_ROLES`). Full IAM stays on `/people` (perm `admin`).
- **i18n** (`frontend/src/i18n/`): hand-rolled bilingual store — **Somali default**, English fallback. `useT()` hook + `LanguageSwitcher`; strings live in `messages.ts` as `{ en, so }`. Somali uses Latin script (no RTL).

## Seeded data
On startup `seed.py` creates roles (`admin`, `owner`, `manager`, `maintenance`, `tenant`), permissions (`admin`, `manage_staff`, `manage_properties`, `manage_tenants`, `view_business`, `manage_maintenance`, `manage_feed`), and a root admin from `ROOT_EMAIL`/`ROOT_PASSWORD`.

`mock_data.py` also builds an Animal Feed demo catalogue (14 SKUs, ~49 lots, ~650 ledger
rows) on the same `is_local_dev` gate. It is seeded independently of the property demo,
so an existing demo database picks it up on the next boot without a destructive rebuild.

**Role permissions are seeded once.** `ROLES` in `seed.py` is a bootstrap default: an existing role keeps whatever an admin configured in the UI, so restarts never undo a grant. The lone exception is the `admin` role, always reconciled to hold every permission so a new permission can't lock admins out. Change a shipped default via a data migration (see `0006_admin_only_business_access.py`), not by editing `ROLES` alone.

## Hormaal Animal Feed
Admin-only inventory console at `/feed` (sign-in at `/feed/login`), guarded by the
`manage_feed` permission — seeded to the `admin` role only, grantable to another role
from **/people** without a code change.

Three-layer stock model: `feed_products` (SKU catalogue) → `feed_batches` (physical lots,
each with its own landed cost and expiry) → `feed_stock_movements` (append-only signed
quantity ledger). Stock on hand is always derived from the lots. Outbound movements
allocate **FEFO**, expired lots cannot be sold (only written off), and reorder alerts use
*sellable* rather than physical stock. Domain logic lives in `internal/feed_inventory.py`
as pure functions; `.claude/rules/feed-inventory.md` holds the full invariant list.

**i18n scope:** the group landing page and the feed sign-in/nav are bilingual
(`group.*`, `feed.*` keys); the feed admin console's internals are English-only for now
— a deliberate "localize public surfaces first" call, and the obvious follow-up. The new
Somali strings are a first pass and still need native review.

## Business intelligence access
`view_business` (analytics + financial data) is **admin-only**: `/analytics`, `/dashboard/admin`, and all of `/finance/*` (monthly rollups and the expense ledger, reads *and* writes). Managers and owners run operations via `manage_properties`/`manage_tenants` — `/dashboard/manager` guards on `manage_tenants` so their landing page still works, and `ManagerDashboard` hides its cash/expense panel without `view_business`.

Admins regrant it without a code change from **/people → Roles & Permissions** (role→permission matrix) and assign roles per user from the Users tab. Guard rails: the `admin` role must keep `admin`, unknown names are rejected, and an admin cannot strip their own access. Note permissions are carried in the JWT, so a grant/revocation applies at the affected user's next sign-in.
