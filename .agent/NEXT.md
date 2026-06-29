# Next

## Next Action

Commit Phase 5.

## Target Files

- `bin/continuity.mjs`
- `src/core/agent-state.mjs`
- `src/core/recovery.mjs`
- `src/core/templates.mjs`
- `src/providers/codex.mjs`
- `src/supervisor/supervisor.mjs`
- `tests/codex-adapter.test.mjs`
- `tests/codex-hooks.test.mjs`
- `tests/recovery.test.mjs`
- `tests/supervisor.test.mjs`
- `README.md`
- `src/README.md`
- `docs/SAFETY.md`
- `docs/STATE_FILES.md`
- `plugins/codex-continuity/README.md`
- `plugins/codex-continuity/skills/continuity/SKILL.md`

## Constraints

- Phase 5 only covers context handoff and continuation.
- Keep cooldown/API failure handling in the supervisor.
- Use Codex `fork` for child continuation.
- Default mode must require user confirmation before child startup.
- Do not add overnight mode or Claude Code runtime.
- Keep provider-specific behavior out of core.

## First Command To Inspect

```sh
git diff --stat
```

## Stop Condition

Stop if git status contains unexpected files.
