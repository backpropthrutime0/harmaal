# Harmaal — Project Guide

Property-management platform. Owners/managers manage **properties**, their **tenants** (leases), and **rent payments**; an **admin** manages users and views business intelligence; **tenants** get a self-service portal.

## Tech stack
- **Backend** (`services/api/`): Python 3.12, FastAPI (async), SQLAlchemy 2.0 (async + asyncpg), Alembic, Pydantic v2, PyJWT, bcrypt, pyotp. Layout: `src/api/{main,config,db,seed}.py`, `models/{orm,schemas}.py`, `internal/{auth,password_validation}.py`, `routers/{auth,properties,tenants}.py`.
- **Frontend** (`frontend/`): React 19, TypeScript (strict), Vite, Tailwind CSS, zustand, axios.
- **DB**: PostgreSQL. Migrations in `shared/migrations/`.
- **Infra**: Docker Compose (`db`, `backend`), Vite dev server for the frontend.

## Architecture notes
- **Single unified `users` table** (admin/owner/tenant) with auth/2FA/lockout columns + **RBAC** via `roles`/`permissions` join tables. Coarse `role` drives routing; fine-grained `permissions` drive `RequirePermission`.
- **Auth** (`/auth`): password login → optional **TOTP 2FA** (`mfa_required` → `/auth/verify-2fa`). JWT (HS256). DB-backed lockout (5 fails → 15 min). Strong password policy. Admin-created users get a one-time password and `must_change_password`.
- **Config**: everything via `api.config.settings` (pydantic-settings, reads `.env`). No hardcoded secrets.

## Common commands
```bash
# Backend (Docker)
docker compose up -d db backend         # Postgres + API on :8000 (runs migrations on boot)
docker compose logs -f backend

# Backend (local, against the compose DB)
cd services/api && pip install -e ".[dev]"
PYTHONPATH=src AUTO_CREATE_TABLES=true uvicorn api.main:app --reload   # quick dev w/o alembic
cd services/api && pytest -q
cd services/api && ruff check src tests && ruff format src tests

# Migrations
alembic -c shared/migrations/alembic.ini upgrade head

# Frontend
cd frontend && npm install && npm run dev    # http://localhost:5173
cd frontend && npx tsc --noEmit && npm run build
```

## Coding standards
- Backend: type hints; `async def` endpoints; `await` all DB calls; eager-load (`selectinload`) anything you serialize (avoid `MissingGreenlet`). Request schemas `extra="forbid"`; every endpoint has `response_model`. Guard routes with `get_current_user` / `RequireRole` / `RequirePermission`.
- Frontend: strict TS, named exports, all HTTP through `src/api.ts`, auth state via `authStore`, Tailwind for styling. React 19 → use `ReactElement` (no global `JSX`).
- See `.claude/rules/` for security-hardening, alembic, and TS/React rules.

## Security
- JWT HS256 only; MFA-stage tokens can't access the API. TOTP `valid_window=1`; secret returned only at setup (Core scope: stored plaintext — harden with pgcrypto later). bcrypt + dummy-hash timing defense. Never serialize `hashed_password`/`totp_secret`. CORS limited to `settings.cors_origins`.

## Key endpoints
`POST /auth/register` · `POST /auth/login` · `POST /auth/verify-2fa` · `POST /auth/setup-totp` · `POST /auth/confirm-totp` · `DELETE /auth/totp` · `POST /auth/change-password` · `GET /auth/me` · `GET/POST /auth/users` (perm `manage_staff` or `admin`; non-admins may only create/see staff roles) · property/tenant/payment CRUD · `GET /business/summary` (perm `view_business`) · `GET /tenants/me` (tenant portal).

## Staff onboarding & i18n
- **Employees** (`/employees`, perm `manage_staff`): managers onboard employees. Non-admins may only *create* `maintenance` (`STAFF_ASSIGNABLE_ROLES` in `routers/auth.py`) — only admins mint `manager` peers — but may *view* both staff roles (`STAFF_VISIBLE_ROLES`). Full IAM stays on `/people` (perm `admin`).
- **i18n** (`frontend/src/i18n/`): hand-rolled bilingual store — **Somali default**, English fallback. `useT()` hook + `LanguageSwitcher`; strings live in `messages.ts` as `{ en, so }`. Somali uses Latin script (no RTL).

## Seeded data
On startup `seed.py` creates roles (`admin`, `owner`, `manager`, `maintenance`, `tenant`), permissions (`admin`, `manage_staff`, `manage_properties`, `manage_tenants`, `view_business`, `manage_maintenance`), and a root admin from `ROOT_EMAIL`/`ROOT_PASSWORD`.
