Create and validate an Alembic migration for Harmaal: $ARGUMENTS

1. Edit the ORM first in `services/api/src/api/models/orm.py`.
2. Autogenerate: `cd shared && alembic -c migrations/alembic.ini revision --autogenerate -m "$ARGUMENTS"` (or run inside the backend container).
3. Review the generated file in `shared/migrations/versions/` — autogenerate is lossy:
   - no unintended `DROP TABLE`/`DROP COLUMN`;
   - manually add enums, indexes, `server_default`s, and CHECK constraints it missed;
   - ensure `downgrade()` is real (not `pass`).
4. Round-trip test: `alembic upgrade head` → `alembic downgrade -1` → `alembic upgrade head`.
5. Update Pydantic schemas if the shape changed; run `pytest -q`.

See `.claude/rules/alembic-migrations.md` for the gotchas.
