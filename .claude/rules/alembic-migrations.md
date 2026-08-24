# Alembic migrations (Harmaal)

Migrations live in `shared/migrations/` (config: `shared/migrations/alembic.ini`, env: `env.py` which loads `settings.sync_database_url` and `api.models.orm` metadata). The backend container runs `alembic upgrade head` on boot via `start.sh`.

## Workflow
1. Edit the ORM in `services/api/src/api/models/orm.py` first.
2. `alembic -c shared/migrations/alembic.ini revision --autogenerate -m "<desc>"`.
3. **Review** — autogenerate with SQLAlchemy is lossy and may miss:
   - enums, partial/functional/renamed indexes, `server_default`s, CHECK constraints, FK `ondelete`.
4. Ensure `downgrade()` is real and reverses `upgrade()` (drop in reverse dependency order).
5. Round-trip: `upgrade head` → `downgrade -1` → `upgrade head`.

## Rules
- Naming: `NNNN_snake_case_description.py` (e.g. `0002_add_phone_to_users.py`).
- Never leave `downgrade()` as `pass`.
- New auth/RBAC columns: keep `services/api/src/api/seed.py` in sync (it seeds roles/permissions/root admin).
- `AUTO_CREATE_TABLES=true` is for quick local/dev/tests only — production relies solely on migrations.
- Keep a single `alembic heads`; resolve branches before merging.
