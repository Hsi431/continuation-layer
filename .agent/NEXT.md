# Next

## Next Action

Commit Phase 6.

## Target Files

- `bin/continuity.mjs`
- `src/core/agent-state.mjs`
- `src/core/recovery.mjs`
- `src/supervisor/supervisor.mjs`
- `tests/init-status-snapshot.test.mjs`
- `tests/recovery.test.mjs`
- `tests/supervisor.test.mjs`
- `README.md`
- `src/README.md`
- `docs/SAFETY.md`
- `docs/STATE_FILES.md`
- `plugins/codex-continuity/README.md`
- `plugins/codex-continuity/skills/continuity/SKILL.md`

## Constraints

- Phase 6 only covers overnight mode.
- Overnight mode is off by default.
- Auto continuation requires explicit overnight mode and auto-continue config.
- Keep cooldown/API failure handling in the supervisor.
- Use Codex `fork` for child continuation.
- Failed recovery or incomplete handoff must stop automation.
- Do not add Claude Code runtime.
- Keep provider-specific behavior out of core.

## First Command To Inspect

```sh
npm test
```

## Stop Condition

Stop if git status contains unexpected files.
