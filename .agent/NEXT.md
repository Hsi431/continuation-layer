# Next

## Next Action

Commit Phase 2 Codex adapter and supervisor basics, then start Phase 3 planning.

## Target Files

- `bin/continuity.mjs`
- `src/providers/`
- `src/supervisor/`
- `src/core/`
- `tests/codex-adapter.test.mjs`
- `tests/supervisor.test.mjs`
- `README.md`
- `docs/`
- `.agent/`

## Constraints

- Keep Phase 2 scoped to Codex adapter and supervisor basics.
- Do not add hooks, skills, context handoff, overnight mode, or Claude Code runtime yet.
- Do not run real Codex in tests.

## First Command To Inspect

```sh
npm test
```

## Stop Condition

Stop before Phase 3 if Phase 2 commit fails or post-commit status is not clean.
