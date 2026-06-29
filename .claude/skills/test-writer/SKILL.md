---
name: test-writer
description: Generate or extend pytest (async) and Vitest tests for Harmaal. Delegates to the test-writer agent.
---

# /test-writer

## Usage
- `/test-writer services/api/src/api/routers/auth.py` — tests for a module
- `/test-writer --coverage` — find untested paths and fill them

## Steps
1. Identify the target and its current coverage.
2. Delegate to the **test-writer** agent.
3. Backend: reuse `conftest.py` fixtures (`client`, `session_factory`); cover happy/error/edge; for auth cover lockout, TOTP, RBAC, password policy.
4. Frontend: Vitest + RTL, mock `api.ts` and `authStore`.
5. Run `cd services/api && pytest -q` and `cd frontend && npx vitest run`; report pass/fail.
