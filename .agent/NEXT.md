# Next

## Next Action

Commit Phase 4 Codex hooks.

## Target Files

- `src/core/agent-state.mjs`
- `src/core/constants.mjs`
- `plugins/codex-continuity/hooks/hooks.json`
- `plugins/codex-continuity/hooks/codex-continuity-hook.mjs`
- `tests/codex-hooks.test.mjs`
- `README.md`
- `plugins/codex-continuity/README.md`
- `docs/STATE_FILES.md`

## Constraints

- Phase 4 only covers Codex hooks.
- Keep hooks short and do not perform long sleeps.
- Keep cooldown/API failure handling in the supervisor, not hooks.
- Do not add overnight mode, context handoff runtime, or Claude Code runtime.
- Commit only the verified Phase 4 hook changes.
- Keep provider-specific behavior out of core.

## First Command To Inspect

```sh
git diff --stat
```

## Stop Condition

Stop if git status contains unexpected files.
