# Next

## Next Action

Optional v0.1.0 tag/release or new-session plugin test.

## Target Files

- `.agent/HANDOFF.md`
- `.agent/NEXT.md`

## Constraints

- Do not create tags/releases unless explicitly requested.
- New Codex sessions are required to pick up newly installed plugin hooks/skills.
- Keep `.agent` as a sanitized dogfood example.
- Do not add runtime features.

## First Command To Inspect

```sh
git status --short
```

## Stop Condition

Stop if tag/release publishing is requested but CI is not green.
