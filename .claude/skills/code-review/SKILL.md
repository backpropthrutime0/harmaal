---
name: code-review
description: Review the Hormaal Group repo's uncommitted changes (or a given file/PR) for correctness, async-safety, type safety, and security. Delegates to the code-reviewer agent.
---

# /code-review

Review code changes in the Hormaal Group monorepo (property-management app + Animal Feed console).

## Usage
- `/code-review` — review uncommitted changes
- `/code-review services/api/src/api/routers/auth.py` — review a specific file
- `/code-review --pr` — review the current branch vs main

## Steps
1. Determine scope: `git diff` (or `git diff main...HEAD` for `--pr`).
2. Delegate to the **code-reviewer** agent with the diff.
3. Quick gates: `cd services/api && ruff check src tests` and `cd frontend && npm run lint && npm run build`.
   (`npx tsc --noEmit` at the frontend root is a no-op — the root tsconfig is a solution file.)
4. Report findings by severity with `file:line` + fix, then a PASS / NEEDS-CHANGES verdict.
