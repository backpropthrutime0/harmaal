Review the current branch as a pull request.

1. Scope the diff: `git diff main...HEAD --stat` then the full diff.
2. Delegate code quality to the **code-reviewer** agent.
3. Delegate security to the **security-auditor** agent (especially if auth/JWT/RBAC touched).
4. Run tests: `cd services/api && pytest -q` and `cd frontend && npx tsc --noEmit` (+ `npx vitest run` if present).
5. Check for: missing tests, schema changes without an Alembic migration, unpinned deps, leaked secrets.
6. Compile one unified report and give a recommendation: **Approve / Request changes / Needs discussion**.
