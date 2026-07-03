# Next

## Next Action

Commit the unattended interactive Codex mode and corrected Project/Global Shell Mode selection if
requested.

## Target Files

- `README.md`
- `bin/continuity.mjs`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `src/core/constants.mjs`
- `src/core/validation.mjs`
- `src/interactive/global-shell-state.mjs`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Constraints

- Do not change cooldown detection patterns, usage-window fallback priority, reset provenance
  priority, package version, or the v0.1 cooldown watchdog path.
- Provider reset times must keep precedence over the local usage-window anchor.
- Do not tag or publish in this pass.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if validation regresses or a requested commit/push fails.
