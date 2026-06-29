# Next

## Next Action

Commit Phase 1 durable state implementation, then start Phase 2 planning.

## Target Files

- `bin/continuity.mjs`
- `src/core/`
- `tests/`
- `README.md`
- `docs/`
- `.agent/`

## Constraints

- Keep Phase 1 scoped to durable state, validation, init/status, and mechanical snapshot.
- Do not add supervisor, provider adapter runtime, cooldown parser, or hooks yet.
- Do not overwrite existing `.agent` state in `init`.

## First Command To Inspect

```sh
npm test
```

## Stop Condition

Stop before Phase 2 if the Phase 1 commit fails or post-commit status is not clean.
