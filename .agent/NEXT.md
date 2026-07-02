# Next

## Next Action

Review and commit Ticket 8 docs and smoke checklist, then run Ticket 9 validation and self-review.

## Target Files

- `bin/continuity.mjs`
- `docs/INTERACTIVE_WRAPPER.md`
- `package.json`
- `package-lock.json`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `src/interactive/stream-detector.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/stream-detector.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Constraints

- Do not change watchdog core logic.
- Do not change recovery mode semantics.
- Run full validation before push; do not tag or publish in this pass.
- Keep `.agent` as a sanitized dogfood example only; do not commit runtime logs.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if validation fails, docs overclaim support, or worktree contains uncommitted runtime residue.
