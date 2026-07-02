# Next

## Next Action

Commit the Global Shell Mode implementation with `Support global interactive shell mode`.

## Target Files

- `bin/continuity.mjs`
- `README.md`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `src/core/git.mjs`
- `src/interactive/global-shell-state.mjs`
- `src/interactive/shell-session.mjs`
- `src/supervisor/supervisor.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/supervisor.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Constraints

- Do not weaken `continuity watch`; it must remain repo-bound.
- Do not claim project handoff, git recovery, snapshots, child continuation, or overnight automation
  in Global Shell Mode.
- Do not tag or publish in this pass.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if commit fails or a requested push/CI check reports a regression.
