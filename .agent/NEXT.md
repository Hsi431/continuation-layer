# Next

## Next Action

Review Phase 0 findings, run verification, then commit the clean scaffold.

## Target Files

- `FINDINGS.md`
- `PLAN.md`
- `.agent/`

## Constraints

- Do not write runtime code until Phase 1 starts.
- Keep Codex-specific behavior out of future core modules.
- Keep cooldown sleeps and restart logic in the supervisor.
- Do not copy AGPL code or account-rotation designs.

## First Command To Inspect

```sh
sed -n '1,260p' FINDINGS.md
```

## Stop Condition

Stop before Phase 1 if review finds a factual mismatch between `FINDINGS.md`, `PLAN.md`, and official CLI behavior.
