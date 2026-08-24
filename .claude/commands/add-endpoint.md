Scaffold a new FastAPI endpoint in Harmaal: $ARGUMENTS

1. Plan: method, path, auth requirement (public / `get_current_user` / `RequireRole` / `RequirePermission`).
2. Schemas: add request (`extra="forbid"`) + response (`from_attributes=True`) models in `services/api/src/api/models/schemas.py`.
3. Handler: add an `async def` to the appropriate router in `services/api/src/api/routers/` (use `AsyncSession = Depends(get_session)`, `await session.execute(select(...))`, eager-load relationships you serialize).
4. Register the router in `services/api/src/api/main.py` if new.
5. If it changes the schema, create an Alembic migration.
6. Tests: add to `services/api/tests/` covering happy/error/auth cases.
7. Verify: `cd services/api && ruff check src && pytest -q`. Show an example `curl`.
