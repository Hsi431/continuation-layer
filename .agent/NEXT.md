# Next

## Next Action

Commit Phase 7.

## Target Files

- `bin/continuity.mjs`
- `src/core/agent-state.mjs`
- `src/core/files.mjs`
- `src/core/templates.mjs`
- `tests/init-status-snapshot.test.mjs`
- `README.md`
- `README.zh-TW.md`
- `docs/STATE_FILES.md`
- `docs/SAFETY.md`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`

## Constraints

- Phase 7 only covers completion and cleanup.
- Task can be marked complete.
- Old handoff state should be archived.
- New tasks should not be polluted by stale handoff files.
- Log retention and handoff rotation must be documented.
- Do not add Claude Code runtime.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if git status contains unexpected files.
