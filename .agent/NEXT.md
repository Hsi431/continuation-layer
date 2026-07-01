# Next

## Next Action

Review and commit the cooldown watchdog blocker fix, then rerun CI before resuming v0.1 release prep.

## Target Files

- `src/supervisor/supervisor.mjs`
- `bin/continuity.mjs`
- `docs/COOLDOWN_WATCHDOG.md`
- `tests/supervisor.test.mjs`

## Constraints

- Do not create tags/releases until watchdog changes are reviewed and CI is green.
- Keep `.agent` as a sanitized dogfood example.
- Do not broaden scope beyond cooldown watchdog follow-up fixes.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if tag/release publishing is requested but CI is not green.
