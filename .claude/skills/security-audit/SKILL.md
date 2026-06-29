---
name: security-audit
description: Security audit of Harmaal — auth/2FA, JWT, RBAC, secrets, injection, infra. Delegates to the security-auditor agent.
---

# /security-audit

## Usage
- `/security-audit` — full audit
- `/security-audit --scope backend|infra|deps`

## Quick scans
- Secrets: `grep -rEn "(secret|password|token)\s*=\s*['\"]" services/api/src` (expect only `settings` references).
- `.env` not tracked: `git ls-files | grep -E '^\.env$'` should be empty.
- Deps: `cd services/api && pip-audit` (if installed); `cd frontend && npm audit --omit=dev`.

## Deep analysis
Delegate to the **security-auditor** agent (uses `.claude/rules/security-hardening.md`). Focus areas: JWT/TOTP, RBAC enforcement, Pydantic boundaries + `response_model` field leakage, parameterized SQL, CORS/headers, Dockerfile.

Output findings by severity with remediation.
