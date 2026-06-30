# Next

## Next Action

Verify, commit, and push Hsi431 owner fix.

## Target Files

- `package.json`
- `README.md`
- `README.zh-TW.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/releases/v0.1.0.md`
- `docs/DOGFOOD.md`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`

## Constraints

- Only fix GitHub owner/metadata/docs and release hygiene.
- Correct owner is `Hsi431/continuation-layer`.
- Do not push to the old incorrect owner.
- Do not create tags/releases unless explicitly requested.
- Keep `.agent` as a sanitized dogfood example.
- Do not add runtime features.

## First Command To Inspect

```sh
npm run format:check
```

## Stop Condition

Stop if final verification fails or remote is not `Hsi431/continuation-layer`.
