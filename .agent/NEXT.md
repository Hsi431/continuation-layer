# Next

## Next Action

Commit and push v0.1 preview release polish.

## Target Files

- `package.json`
- `.prettierrc`
- `.github/workflows/ci.yml`
- `README.md`
- `README.zh-TW.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/releases/v0.1.0.md`
- `docs/DOGFOOD.md`
- `bin/continuity.mjs`
- `src/**/*.mjs`
- `tests/**/*.mjs`
- `plugins/**/*.mjs`
- `plugins/**/*.md`
- `.agents/**/*.md`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`

## Constraints

- This round is release polish only; do not add major runtime features.
- Keep Claude Code as v1/future path.
- Do not add account rotation, provider-limit bypass, autonomous loops, auto PR, or auto commit behavior.
- README must not contain personal absolute paths.
- Formatting must not change behavior.
- CI must not invoke real Codex provider sessions.
- Package must not include active `.agent` state or private logs.

## First Command To Inspect

```sh
npm run format:check
```

## Stop Condition

Stop if final verification fails.
