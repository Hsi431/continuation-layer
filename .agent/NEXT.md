# Next

## Next Action

Review the `continuity codex` alias diff and commit if requested.

## Target Files

- `bin/continuity.mjs`
- `README.md`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `docs/releases/v0.2.0.md`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `src/supervisor/supervisor.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/supervisor.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Constraints

- Keep `continuity shell` as an alias for `continuity codex`.
- Do not change interactive wrapper runtime behavior, cooldown detection, Global Shell Mode, Project
  Shell Mode, recovery, or the PTY runner beyond naming and guidance.
- Do not tag or publish in this pass.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if validation regresses or a requested commit/push fails.
