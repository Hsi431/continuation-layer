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

Interactive Project Shell Mode and Global Shell Mode now record `usage_window_started_at` and use it
as the fallback cooldown anchor when providers do not return an explicit reset time.

## Goal

Ensure `continuity codex` computes fallback resume times from `usage_window_started_at + 5h +
buffer`, not `cooldown_detected_at + 5h + buffer`, for both project and global shell modes.

## What Changed

- Project interactive shell start now sets `usage_window_started_at` alongside
  `interactive_shell_started_at`, preserving an existing anchor when present.
- Global shell initial state now includes `usage_window_started_at`.
- New global shell starts write `usage_window_started_at = startedAt`; adopted existing cooldown
  state keeps its existing anchor.
- `recordGlobalInteractiveCooldown()` now passes `existing.usage_window_started_at` into
  `calculateNextResumePlan()`.
- Added focused interactive tests for project/global start anchors, project/global fallback resume
  calculation, and provider reset precedence.

## Files Touched

- `src/interactive/global-shell-state.mjs`
- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Tests Run

- `npm ci`
- `npm run format:check`
- `npm run check`
- `npm test`
- `npm run pack:check`
- `git diff --check`

## Test Result

Passed.

## Manual Smoke

No manual TTY smoke was run for this targeted usage-window anchor fix.

## Important Decisions

- Provider reset times still win over local usage-window anchors.
- The usage-window anchor is created at interactive shell start, not at cooldown detection.
- If no provider reset and no usage-window anchor exists, `cooldown_detected_at` remains the final
  fallback.

## Known Risks

- Real interactive Codex TUI smoke was not rerun for this targeted state/calculation patch.

## Next Exact Steps

1. Commit if requested.
2. Push only if requested or approved.
3. Review CI after push if a push is requested.

## Last Updated

2026-07-03T00:22:47Z
