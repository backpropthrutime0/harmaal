---
name: docker-rebuild
description: Rebuild and restart the Hormaal Group Docker services after code changes, then verify health.
---

# /docker-rebuild

## Usage
- `/docker-rebuild` — rebuild changed services
- `/docker-rebuild backend` — rebuild a specific service

## Steps
1. `git status --short` to see what changed.
2. `docker compose build <service>` (default: `backend`).
3. `docker compose up -d`.
4. `docker compose ps` — confirm `healthy`/`running`.
5. `docker compose logs --tail=30 backend` — confirm migrations ran and uvicorn started.

Services: `db`, `backend`. (Frontend runs via `npm run dev` unless added to compose.)
