# Decisions

## Decision: Phase 0 before runtime code

Reason: The plan depends on provider CLI, plugin, skill, and hook capabilities that must be verified.

Date: 2026-06-29

Related files:

- `FINDINGS.md`
- `PLAN.md`

Consequence: Runtime implementation starts only after findings are complete.

## Decision: Provider-specific logic stays outside core

Reason: Codex and Claude Code behaviors differ and may change.

Date: 2026-06-29

Related files:

- `docs/ARCHITECTURE.md`
- `src/providers/`

Consequence: Cooldown parsing, resume commands, and hook integration live in provider adapters or plugin packages.

## Decision: Hooks must stay short

Reason: Long waits inside hooks are brittle and can block provider lifecycle execution.

Date: 2026-06-29

Related files:

- `docs/SAFETY.md`
- `plugins/codex-continuity/`

Consequence: Cooldown waiting belongs to the supervisor.

