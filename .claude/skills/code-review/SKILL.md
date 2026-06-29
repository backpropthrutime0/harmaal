---
name: code-review
description: Review Harmaal's uncommitted changes (or a given file/PR) for correctness, async-safety, type safety, and security. Delegates to the code-reviewer agent.
---

# /code-review

Review code changes in Harmaal.

## Usage
- `/code-review` — review uncommitted changes
- `/code-review services/api/src/api/routers/auth.py` — review a specific file
- `/code-review --pr` — review the current branch vs main

## Steps
1. Determine scope: `git diff` (or `git diff main...HEAD` for `--pr`).
2. Delegate to the **code-reviewer** agent with the diff.
3. Quick gates: `cd services/api && ruff check src` and `cd frontend && npx tsc --noEmit`.
4. Report findings by severity with `file:line` + fix, then a PASS / NEEDS-CHANGES verdict.
