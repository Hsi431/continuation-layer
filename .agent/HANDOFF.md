# Handoff

## Task ID

continuation-layer-v0

## Provider

codex

## Current Session

None.

## Parent Session

None.

## Status

v0.1 release hygiene is the active dogfood state. The cooldown watchdog behavior is implemented: `continuity watch` starts a supervised provider process, records cooldown metadata, waits for `next_resume_at`, and resumes the same Codex session under circuit breakers.

## Goal

Keep the repository ready for v0.1 final review without changing cooldown watchdog core behavior.

## Current Stage

Release hygiene and final documentation review.

## What Changed

- Added `continuity watch` as the recommended long-lived cooldown watchdog mode.
- Kept `continuity start` as manual one-shot mode and `continuity resume` as manual same-session cooldown resume.
- Added reset-time provenance for provider reset timestamps, provider relative resets, usage-window anchors, and conservative cooldown-detected fallback.
- Added `cooldown_resume` recovery policy so stale or missing semantic handoff is warning-only for same-session cooldown resume.
- Kept `strict_continuation` recovery policy for context continuation and overnight child sessions.
- Added watchdog adoption of existing `cooling_down` state so interrupted waits can be restarted with `continuity watch`.
- Documented that direct `codex` commands cannot be monitored by Continuation Layer.
- Documented that an interactive terminal wrapper is future work, not v0.1 behavior.

## Files Touched

- `README.md`
- `README.zh-TW.md`
- `docs/COOLDOWN_WATCHDOG.md`
- `docs/DOGFOOD.md`
- `docs/RELEASE_CHECKLIST.md`
- `docs/releases/v0.1.0.md`
- `.agent/`
- `AGENTS.md`

## Important Decisions

- The committed `.agent/` directory is an intentional sanitized dogfood example.
- `.agent` must not contain provider-private session dumps, secrets, personal absolute paths, stale git status, or one-off runtime logs.
- Long cooldown waits belong to the foreground supervisor, not hooks.
- Cooldown same-session recovery may use stale semantic handoff as context, but child continuation remains strict.

## Current Git State Summary

This handoff is a sanitized release-state example. Run `git status --short` before editing or publishing.

## Tests Run

Release hygiene verification:

- `npm run format:check`
- `npm run check`
- `npm test`
- `npm run pack:check`
- `npm pack --dry-run`
- `git diff --check`

## Test Result

Passed.

## Known Risks

- Real provider smoke tests remain opt-in and are not part of CI.
- Provider CLI output and session-id extraction can change.
- Direct `codex` processes cannot be adopted after the fact.

## Unfinished Work

- Commit the sanitized docs and dogfood state.
- Push the release hygiene commit if requested.
- Wait for CI before tagging or publishing v0.1.

## Next Exact Steps

1. Commit the sanitized docs and dogfood state.
2. Push the release hygiene commit if requested.
3. Review CI before creating a v0.1 tag or release.

## Do Not Redo

- Do not change cooldown watchdog core logic during release hygiene.
- Do not change recovery mode semantics.
- Do not add Claude Code runtime support in v0.1 cleanup.
- Do not commit provider-private logs or local runtime residue.

## Last Updated

2026-07-01T20:51:16Z
