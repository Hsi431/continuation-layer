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

`continuity codex` is implemented as the recommended interactive Codex wrapper entrypoint, with
`continuity shell` retained as an alias.

## Goal

Make `continuity codex` the primary command users run instead of direct `codex`, while preserving
the existing `continuity shell` runtime behavior as an alias.

## What Changed

- Added `continuity codex` to the CLI as the main interactive wrapper command.
- Kept `continuity shell` as an alias using the same Project Shell Mode and Global Shell Mode code
  path.
- Updated CLI help to list `codex [prompt]` before `shell [prompt]`.
- Updated dry-run handling so `continuity codex --dry-run` and `continuity shell --dry-run` build
  the same provider command, including prompt forwarding.
- Updated non-git `--require-repo` behavior and watch guidance to point users at
  `continuity codex`.
- Updated README, interactive wrapper docs, smoke docs, release notes, and tests to present
  `continuity codex` as the recommended entrypoint.

## Files Touched

- `bin/continuity.mjs`
- `README.md`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `docs/releases/v0.2.0.md`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `src/supervisor/supervisor.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/supervisor.test.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`

## Tests Run

- `node --test tests/interactive-runner.test.mjs`
- `node --test tests/supervisor.test.mjs`
- `node --test tests/docs-cli.test.mjs`
- `npm ci`
- `npm run format:check`
- `npm run check`
- `npm test`
- `npm run pack:check`
- `git diff --check`

## Test Result

Passed.

## Manual Smoke

- In `/tmp/continuity-codex-alias-test`, `continuity codex --dry-run` and
  `continuity shell --dry-run` both printed `codex -C /tmp/continuity-codex-alias-test`.
- In `/tmp/continuity-codex-alias-test`, prompt dry-runs for both commands printed
  `codex -C /tmp/continuity-codex-alias-test 'explain this repo'`.
- In `/home/fnata_claw/continuation-layer`, prompt dry-runs for both commands printed
  `codex -C /home/fnata_claw/continuation-layer 'explain this repo'`.
- In `/tmp/continuity-codex-alias-test`, `continuity codex --require-repo --dry-run` failed with
  `continuity must run inside a git repository`.

## Important Decisions

- `continuity codex` is the recommended interactive wrapper command.
- `continuity shell` remains an alias for users who already adopted it.
- Runtime Project Shell Mode, Global Shell Mode, cooldown detection, recovery, and PTY runner logic
  were not intentionally changed beyond command naming and user-facing guidance.

## Known Risks

- Real interactive Codex TUI smoke was not rerun for this alias-only patch.
- Source-level CLI tests cover the alias path because prior process-spawn style checks are brittle
  in restricted test environments.

## Next Exact Steps

1. Review the diff.
2. Commit if requested.
3. Push only if requested or approved.

## Last Updated

2026-07-02T23:54:07Z
