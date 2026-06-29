# Continuation Layer

Continuation Layer is a task continuity guard for CLI coding agents.

The v0 target is Codex CLI first, with a Claude Code adapter skeleton kept separate. The project handles two interruption classes:

- Cooldown walls: rate limits, usage limits, 429s, and reset windows.
- Context pressure: handoff before compaction, then explicit or overnight continuation.

This project does not bypass provider limits. It waits for legal reset windows, records durable state, and reduces the risk of resuming the wrong task.

## Current Status

Phase 0 is complete and the project remains scaffold-only. No supervisor, provider adapter, hook, or plugin runtime code has been implemented yet.

## Intended Shape

```text
continuation-core
codex-continuity-plugin
continuity-supervisor
future claude-code adapter/plugin
```

## Completed First Milestone

Phase 0 confirmed existing tools and official CLI capabilities before implementation:

1. Read cooldown and auto resume repositories.
2. Read handoff and continuation repositories.
3. Verified Codex resume, plugin, skill, and hook support against official docs and CLI help.
4. Verified Claude Code resume, plugin, skill, and hook support against official docs and CLI help.
5. Produced `FINDINGS.md`.
6. Updated `PLAN.md` where real CLI behavior differed from the initial plan.

## Safety Boundaries

- Do not rotate accounts or bypass provider limits.
- Do not sleep for hours inside hooks.
- Do not auto commit.
- Do not auto continue from incomplete handoff state.
- Treat git status and git diff as source of truth during recovery.

## Repository Layout

```text
.agent/                         durable task state for this repo
docs/                           architecture, safety, and research notes
plugins/codex-continuity/       future Codex plugin package
plugins/claude-code-adapter/    future Claude Code adapter docs/skeleton
src/                            future core, supervisor, provider, CLI code
tests/                          future unit and integration tests
FINDINGS.md                     Phase 0 findings
PLAN.md                         implementation plan
```

## Next Command

```sh
sed -n '1,220p' FINDINGS.md
```
