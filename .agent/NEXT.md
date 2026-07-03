# Next

## Next Action

Commit the interactive/global shell usage-window anchor fix if requested.

## Target Files

- `src/interactive/global-shell-state.mjs`
- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Constraints

- Do not change PTY runner, stream detector, mode selection, CLI aliasing, package version, or the
  v0.1 cooldown watchdog path.
- Provider reset times must keep precedence over the local usage-window anchor.
- Do not tag or publish in this pass.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if validation regresses or a requested commit/push fails.
