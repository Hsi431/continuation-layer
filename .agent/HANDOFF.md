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

v0.2 interactive wrapper groundwork is active. Ticket 0 research through Ticket 9 release preview validation are complete in the working tree. The v0.1 cooldown watchdog core remains unchanged.

## Goal

Build a Linux-first experimental interactive wrapper without changing cooldown watchdog or recovery semantics.

## Current Stage

Ticket 9 complete; next step is push and CI review.

## What Changed

- Added `docs/INTERACTIVE_WRAPPER.md` with Ticket 0 research and Ticket 1/2 status.
- Added `continuity shell --dry-run` to print the interactive Codex command.
- Added `node-pty` as the selected PTY dependency.
- Added `src/interactive/pty-runner.mjs` for PTY spawn, stdin/stdout pass-through, resize handling, raw mode, abort handling, and cleanup.
- Added `src/interactive/shell-session.mjs` to build the Codex interactive command through the existing provider adapter.
- Wired non-dry-run `continuity shell` to the PTY runner with a clear non-TTY failure path.
- Added fake-PTY tests for pass-through, resize, cleanup, non-TTY failure, and command construction.
- Added `src/interactive/stream-detector.mjs` for ANSI-stripped rolling-buffer cooldown detection.
- Reused the Codex adapter's `detectCooldownError` instead of duplicating cooldown patterns.
- Wired `runInteractiveShell` to tee PTY output into the detector and expose an `onCooldown` callback.
- Added stream detector tests for plain text, ANSI-colored text, chunked output, false positives, one-shot event emission, and buffer cap behavior.
- Added `src/interactive/cooldown-recorder.mjs` to write interactive cooldown state, next resume time, reset provenance, snapshot, and sessions event.
- `runInteractiveShell` now records interactive cooldowns and prints wrapper cooldown metadata to stderr.
- Added fake-PTY test coverage for interactive cooldown state/snapshot/event/wrapper message.
- Added input gating after interactive cooldown detection.
- Enter sends `SIGINT` to Codex as a graceful pause request; Ctrl-C aborts wrapper control while preserving state.
- Added tests that normal input is blocked after cooldown and graceful/abort signals are sent without hard kill.
- Added wait until `next_resume_at` after user-confirmed pause.
- Added interactive resume command selection: explicit session id first, `codex resume --last` fallback.
- Recorded `interactive_resume_target`, `interactive_resume_target_provenance`, and incremented `watch_resume_count` for interactive auto-resumes.
- Added tests for same-session interactive resume and `--last` fallback.
- Added adoption of existing interactive `cooling_down` state on `continuity shell` restart.
- Added tests for adoption, immediate resume when `next_resume_at` is past, broken cooldown abort, and refusing non-interactive cooldown adoption.
- Updated README and README.zh-TW with experimental `continuity shell` guidance.
- Added `docs/SMOKE_INTERACTIVE.md` with Linux-first manual smoke checklist and troubleshooting.
- Added docs tests for interactive wrapper limitations.
- Added `docs/releases/v0.2.0.md` preview release notes.
- Updated release checklist for experimental interactive wrapper docs and smoke coverage.
- Ran full validation from clean install.

## Files Touched

- `bin/continuity.mjs`
- `docs/INTERACTIVE_WRAPPER.md`
- `package.json`
- `package-lock.json`
- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `src/interactive/cooldown-recorder.mjs`
- `src/interactive/stream-detector.mjs`
- `tests/docs-cli.test.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/stream-detector.test.mjs`

## Important Decisions

- The committed `.agent/` directory is an intentional sanitized dogfood example.
- `.agent` must not contain provider-private session dumps, secrets, personal absolute paths, stale git status, or one-off runtime logs.
- Long cooldown waits belong to the foreground supervisor, not hooks.
- Cooldown same-session recovery may use stale semantic handoff as context, but child continuation remains strict.
- `node-pty` is the real PTY runtime dependency for the Linux-first wrapper; tests use fake PTY adapters.

## Current Git State Summary

Branch is ahead of origin with v0.2 interactive wrapper commits. Run `git status --short` before publishing.

## Tests Run

- `npm ci`
- `npm run format:check`
- `npm run check`
- `npm test`
- `npm run pack:check`
- `git diff --check`

## Test Result

Passed.

## Known Risks

- Real Codex TUI smoke was not completed in this tool environment because it lacks a normal interactive terminal.
- Interactive cooldown recording, graceful pause, wait/resume, and existing interactive `cooling_down` adoption are implemented.
- CI still needs to run after push.
- Real provider smoke tests remain opt-in and are not part of CI.
- Provider CLI output and session-id extraction can change.
- Direct `codex` processes cannot be adopted after the fact.

## Unfinished Work

- Manual Linux TTY smoke for `continuity shell`.

## Next Exact Steps

1. Push the v0.2 interactive wrapper commits.
2. Review CI status before tagging or publishing.
3. Run manual Linux TTY smoke before claiming the interactive runtime path fully accepted.

## Do Not Redo

- Do not change cooldown watchdog core logic during release hygiene.
- Do not change recovery mode semantics.
- Do not add Claude Code runtime support in v0.1 cleanup.
- Do not commit provider-private logs or local runtime residue.

## Last Updated

2026-07-02T00:00:00Z
