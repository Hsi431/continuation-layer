# Next

## Next Action

Commit Phase 3 Codex skill.

## Target Files

- `.agent/`
- `.agents/skills/continuity`
- `plugins/codex-continuity/`
- `README.md`

## Constraints

- Commit only the verified Phase 3 skill/package/docs/durable-state changes.
- Do not start Phase 4 until Phase 3 commit is confirmed and the worktree is clean.
- Keep hooks short and do not perform long sleeps.
- Keep cooldown/API failure handling in the supervisor, not hooks.
- Do not add hooks, overnight mode, context handoff runtime, or Claude Code runtime to the Phase 3 commit.
- The current user explicitly requested commit after PASS review and clean tests; do not make any other commits.
- Keep provider-specific behavior out of core.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if final review fails, tests fail, or git status contains unexpected files.
