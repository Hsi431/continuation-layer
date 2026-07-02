# Next

## Next Action

Review and commit Ticket 3 stream cooldown detector, then start Ticket 4 interactive cooldown state recording.

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
- Keep Ticket 4 limited to recording cooldown state and snapshot; do not add wait/resume yet.
- Keep `.agent` as a sanitized dogfood example only; do not commit runtime logs.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if interactive cooldown recording would require changing cooldown watchdog semantics or Codex adapter command semantics.
