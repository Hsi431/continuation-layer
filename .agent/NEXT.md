# Next

## Next Action

Commit open-source readiness changes.

## Target Files

- `.gitignore`
- `LICENSE`
- `package.json`
- `README.md`
- `README.zh-TW.md`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`

## Constraints

- README should be marketing-friendly but technically accurate.
- License must be Apache-2.0.
- Package metadata should not remain private.
- NPM package should not include active `.agent` state.
- Do not claim Claude Code full runtime is implemented.
- Do not weaken safety boundaries: no account rotation, no provider-limit bypass, no auto commit.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if git status contains unexpected files.
