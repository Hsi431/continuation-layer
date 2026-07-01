# Next

## Next Action

Commit the documentation and sanitized dogfood state, then wait for CI before tagging v0.1.

## Target Files

- `README.md`
- `README.zh-TW.md`
- `docs/COOLDOWN_WATCHDOG.md`
- `docs/DOGFOOD.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/releases/v0.1.0.md`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`
- `.agent/AUTO_SNAPSHOT.md`
- `.agent/state.json`
- `.agent/sessions.jsonl`

## Constraints

- Do not change watchdog core logic.
- Do not change recovery mode semantics.
- Keep `.agent` as a sanitized dogfood example only.
- Do not create tags or releases until release verification has passed and CI is green.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if release docs overclaim v0.1 behavior or `.agent` contains stale runtime state.
