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

Unattended interactive Codex mode and corrected Project/Global Shell Mode selection are implemented
and validated.

## Goal

Add `continuity codex --unattended` / `--overnight`, explicit `--global`, and product-safe mode
selection for initialized repos, uninitialized repos, corrupt `.agent/`, and non-git directories.

## What Changed

- Added CLI flags:
  - `--unattended`
  - `--overnight` alias for `--unattended`
  - `--global` to force Global Shell Mode
- Rejected `--global --require-repo` as a conflicting flag combination.
- Project Shell Mode now applies to any git repo with a valid `.agent/`.
- Git repos without `.agent/` fall back to Global Shell Mode by default, print init guidance, and do
  not create `.agent/`.
- Existing partial/corrupt `.agent/` still fails loudly and does not fall back to global state.
- Unattended mode auto-pauses Codex on cooldown with `SIGINT`, then uses `SIGTERM`/`SIGKILL` after
  grace if the child ignores the pause.
- Forced unattended child termination preserves top-level `status = cooling_down`, records
  `interactive_shell_status = cooldown_child_terminated` and
  `last_tty_event = unattended_pause_forced`, then proceeds to wait/resume.
- Global shell state now carries interactive shell status/TTY event markers for forced unattended
  termination.
- PTY data callbacks now receive child/finish context so the shell session can terminate only the
  Codex child and still restore terminal state through the PTY runner cleanup path.
- README, interactive wrapper docs, and smoke docs now describe safety mode, unattended mode,
  arbitrary initialized repos, uninitialized-repo Global fallback, and `--global`.

## Files Touched

- `README.md`
- `bin/continuity.mjs`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `src/core/constants.mjs`
- `src/core/validation.mjs`
- `src/interactive/global-shell-state.mjs`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `tests/docs-cli.test.mjs`
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

- `continuity codex` remains safe interactive mode by default and still asks for Enter on cooldown.
- `--unattended` and `--overnight` are explicit opt-ins for auto-pause/wait/resume.
- `--global` forces Global Shell Mode and conflicts with `--require-repo`.
- Missing `.agent/` means Global Shell Mode; existing broken `.agent/` means fail loudly.
- Forced unattended termination only targets the Codex child, not the wrapper, and the wrapper
  proceeds to wait/resume.

## Known Risks

- Real interactive Codex TUI smoke was not rerun for this runtime patch; behavior is covered with
  fake PTY tests.

## Next Exact Steps

1. Commit if requested.
2. Push only if requested or approved.
3. Review CI after push if a push is requested.

## Last Updated

2026-07-03T15:32:09Z
