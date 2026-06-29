---
name: refactor
description: Refactor Harmaal code for clarity/reuse while preserving behavior (Python async + SQLAlchemy 2.0; React/TS).
---

# /refactor

## Usage
- `/refactor services/api/src/api/routers/tenants.py`
- `/refactor --pattern extract-helper`

## Patterns
- **Python**: extract shared query helpers (e.g. ownership checks), use `select()` + `selectinload`, consolidate config in `settings`, keep endpoints thin (delegate to internal modules).
- **TypeScript/React**: extract custom hooks, decompose large components, narrow types (no `any`), route all HTTP through `src/api.ts`.

## Process
1. Establish a behavior baseline (run tests).
2. Refactor in small steps; re-run tests/`tsc` between steps.
3. Never change external behavior; if no tests exist, write them first.
4. Summarize what changed and why.
