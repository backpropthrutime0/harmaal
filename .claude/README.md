# Harmaal — Claude Code setup

Project automation for Claude Code, adapted from the avis_tools template for Harmaal's stack (FastAPI async + SQLAlchemy/Alembic; React + TS + Vite + Tailwind + zustand).

## Agents (`.claude/agents/`)
| Agent | Model | Purpose |
|-------|-------|---------|
| code-reviewer | opus | Correctness/async/type/security review of diffs |
| security-auditor | opus | Auth/JWT/RBAC/secrets/injection audit |
| test-writer | sonnet | pytest (async) + Vitest tests |
| debugger | opus | Symptom → root-cause tracing |
| devops | sonnet | Docker/compose/Alembic/CI |
| applier | sonnet | Apply review findings as minimal edits |

## Skills (`.claude/skills/`)
`/code-review` · `/security-audit` · `/test-writer` · `/refactor` · `/docker-rebuild`

## Commands (`.claude/commands/`)
`/review-pr` · `/fix-issue <n>` · `/deploy-check` · `/add-endpoint <desc>` · `/db-migrate <desc>`

## Rules (`.claude/rules/`)
Always-on coding constraints: `alembic-migrations`, `security-hardening`, `typescript-react`.

## Hooks (`.claude/hooks/`)
`validate-bash.sh` — blocks destructive shell commands, warns on prod-adjacent ones.

## Settings
`settings.json.example` and `settings.local.json.example` are templates — **rename** them to activate (they pre-approve commands and enable auto-format hooks; review first). MCP servers are configured in `.mcp.json` (postgres, github, filesystem, fetch, sequential-thinking, context7, playwright, docker).

## Git tracking
Commit: `agents/`, `skills/`, `commands/`, `rules/`, `hooks/`, `README.md`, `*.example`.
Ignore: `settings.local.json`, `CLAUDE.local.md`.
