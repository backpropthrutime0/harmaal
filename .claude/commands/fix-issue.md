Resolve issue #$ARGUMENTS end to end.

1. Read the issue: `gh issue view $ARGUMENTS`.
2. Reproduce / understand the root cause (use the **debugger** agent if it's a bug).
3. Create a branch: `git checkout -b fix/issue-$ARGUMENTS`.
4. Implement following project conventions (async, Pydantic v2, RBAC guards; Tailwind/zustand on the frontend).
5. Add or update tests.
6. Verify: `cd services/api && ruff check src && pytest -q` and `cd frontend && npx tsc --noEmit`.
7. Commit: `fix: resolve #$ARGUMENTS — <short description>`.
8. Summarize the change.
