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

Global Shell Mode for `continuity shell` is implemented, validated, smoke-tested, and ready to
commit.

## Goal

Allow `continuity shell` to run outside git repositories as an interactive Codex cooldown wrapper
without weakening repo-bound project continuity or `continuity watch`.

## What Changed

- `continuity shell` now auto-detects Project Shell Mode inside git and Global Shell Mode outside
  git.
- Added `continuity shell --require-repo` to preserve the old repo-required failure behavior.
- Added global shell state under `$XDG_STATE_HOME/continuation-layer/`, falling back to
  `~/.local/state/continuation-layer/`.
- Added global shell state files:
  - `global-shell-state.json`
  - `global-shell-sessions.jsonl`
- Global mode launches Codex in the current working directory, records cooldown state, waits until
  `next_resume_at`, resumes explicit detected session ids, and falls back to `codex resume --last`.
- Global mode does not create `.agent/`, does not run git recovery, and does not claim handoff,
  child continuation, project snapshots, or overnight automation.
- `continuity watch` remains repo-bound and now fails outside git with guidance to use
  `continuity shell` for global interactive mode.
- README, interactive wrapper docs, and smoke docs now distinguish Project Shell Mode and Global
  Shell Mode.

## Files Touched

- `bin/continuity.mjs`
- `README.md`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `src/core/git.mjs`
- `src/interactive/global-shell-state.mjs`
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

- Global mode dry-run in `/tmp/continuity-shell-global-test` printed
  `codex -C /tmp/continuity-shell-global-test`.
- Global mode real TTY smoke with temporary `CODEX_HOME` and `XDG_STATE_HOME` printed the Global
  Shell Mode notice, reached the Codex login TUI, wrote global shell state under `/tmp`, and did not
  create `.agent/`.
- Project mode dry-run in `/home/fnata_claw/continuation-layer` printed
  `codex -C /home/fnata_claw/continuation-layer`.
- Project mode real TTY smoke in a disposable git repo reached the Codex login TUI and wrote
  repo-local `.agent` interactive shell state.

## Important Decisions

- Global Shell Mode is intentionally a cooldown wrapper only.
- Explicit session-id resume in global mode only uses ids detected from Codex output or already
  recorded in an adopted global cooldown.
- `codex resume --last` in global mode is best-effort and marks state `failed` if that resume exits
  nonzero.
- `continuity watch` remains repo-bound.

## Known Risks

- Real authenticated Codex task execution was not exercised; temporary `CODEX_HOME` smoke reached
  the unauthenticated Codex login TUI.
- Provider CLI output and session-id extraction can change.
- Global Shell Mode has one minimal global state file and is not a multi-project project recovery
  system.

## Next Exact Steps

1. Commit with `Support global interactive shell mode`.
2. Push only if requested or approved.
3. Review CI after push.

## Last Updated

2026-07-02T23:50:00Z
