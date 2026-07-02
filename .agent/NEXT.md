# Next

## Next Action

Push the v0.2 interactive wrapper commits and review CI.

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
- Do not tag or publish in this pass.
- Wait for CI before any release tag.
- Keep `.agent` as a sanitized dogfood example only; do not commit runtime logs.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if push fails or CI reports a regression.
