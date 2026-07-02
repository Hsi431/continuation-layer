# Next

## Next Action

Review and commit Ticket 7 existing cooldown adoption, then start Ticket 8 docs and smoke checklist.

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
- Keep Ticket 8 documentation honest: Linux-first, experimental, no direct `codex` adoption.
- Keep `.agent` as a sanitized dogfood example only; do not commit runtime logs.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if docs imply Windows native support, Claude Code interactive support, or direct running `codex` can be adopted.
