Pre-deployment readiness check for Harmaal. Report a go / no-go with blocking issues.

1. `git status` — working tree clean.
2. Backend: `cd services/api && ruff check src && ruff format --check src && pytest -q`.
3. Frontend: `cd frontend && npx tsc --noEmit && npm run build`.
4. Migrations: confirm any model change has a matching `shared/migrations/versions/*` with a real `downgrade()`; `alembic heads` shows a single head.
5. Secrets: `.env` not tracked; `JWT_SECRET`/`ROOT_PASSWORD` are non-default for prod (`ENVIRONMENT=production` validation passes).
6. Docker: `docker compose config` is valid; image builds.
7. Output: ✅ ready / ❌ blocked + the specific blockers.
