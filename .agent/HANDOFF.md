# Handoff

## Task ID

continuation-layer-v0

## Provider

codex

## Current Session

Not recorded.

## Parent Session

None.

## Status

Phase 2 Codex adapter and supervisor basics are complete and third review passed.

## Goal

Build Continuation Layer v0 for Codex CLI first, with a future Claude Code adapter path.

## Current Stage

Phase 2 complete. Ready for final verification and commit.

## What Changed

- Added core constants and defaults for config, state, statuses, modes, events, and providers.
- Added schema validation for `.agent/config.json` and `.agent/state.json`.
- Added git snapshot helpers and `.agent` file helpers.
- Added `continuity init`, `continuity status`, and `continuity snapshot`.
- Added templates for `HANDOFF.md`, `NEXT.md`, `DECISIONS.md`, and `AUTO_SNAPSHOT.md`.
- Added tests for validation, init non-overwrite behavior, status loading, snapshot generation, and session event append.
- Updated docs for durable state CLI and state behavior.
- Fixed review finding: `init` now rejects incomplete existing `.agent` state even when config and state both exist.
- Fixed review finding: config/state drift is rejected before status or snapshot continues.
- Fixed stale README and handoff language after running the real snapshot.
- Added tests for missing required files, config/state drift, and non-git init refusal.
- Fixed second review finding: generated handoff template now states init already wrote `AUTO_SNAPSHOT.md`.
- Expanded drift tests across `provider`, `overnight_mode`, and `auto_continue_after_handoff` for both status and snapshot.
- Third Phase 1 review passed with no blocking findings.
- Added provider adapter boundary and Codex adapter.
- Added Codex start/resume/fork command construction.
- Added cooldown detection, reset-time parsing, session-id extraction, and resume/continuation prompt builders.
- Added supervisor process runner with stdout/stderr log capture.
- Added supervisor start and cooldown resume flows with `cooling_down` and `cooldown_resumed` state transitions.
- Added `continuity start` and `continuity resume`, with `--dry-run`.
- Added tests for Codex adapter behavior, log capture, simulated cooldown transition, fallback reset windows, waiting before reset, and same-session resume.
- Fixed review finding: `continuity start` now uses non-interactive `codex exec` under the supervisor.
- Fixed review finding: runner spawn errors transition durable state to `failed` and write a snapshot.
- Tightened cooldown detection to avoid generic `try again` false positives.
- Refreshed mechanical snapshot after Phase 2 review fixes.
- Fixed second review finding: cooldown detection no longer treats generic `context/token/file size limit` messages as cooldown.
- Removed stale snapshot-instruction wording from handoff history.
- Third Phase 2 review passed with no blocking findings.

## Files Touched

- `FINDINGS.md`
- `PLAN.md`
- `bin/continuity.mjs`
- `src/core/constants.mjs`
- `src/core/validation.mjs`
- `src/core/git.mjs`
- `src/core/files.mjs`
- `src/core/templates.mjs`
- `src/core/agent-state.mjs`
- `tests/validation.test.mjs`
- `tests/init-status-snapshot.test.mjs`
- `tests/codex-adapter.test.mjs`
- `tests/supervisor.test.mjs`
- `package.json`
- `src/README.md`
- `src/providers/adapter.mjs`
- `src/providers/codex.mjs`
- `src/supervisor/process-runner.mjs`
- `src/supervisor/supervisor.mjs`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/AUTO_SNAPSHOT.md`
- `.agent/state.json`
- `.agent/sessions.jsonl`
- `README.md`
- `docs/RESEARCH_TARGETS.md`
- `plugins/codex-continuity/README.md`
- `plugins/claude-code-adapter/README.md`
- `docs/SAFETY.md`
- `docs/STATE_FILES.md`
- `tests/README.md`

## Important Decisions

- Codex cooldown detection must be supervisor-owned because Codex does not document a `StopFailure` hook.
- Codex same-session cooldown resume should use `codex resume` or `codex exec resume`.
- Codex context continuation should use `codex fork` when creating a child thread.
- Codex v0 hooks should use supported command handlers only.
- Claude Code remains experimental in v0, but its `--resume`, `--continue`, `--fork-session`, and `StopFailure` paths are documented for the skeleton.
- Do not copy AGPL code or account-rotation designs.
- Phase 1 uses Node standard library only; no external dependencies.
- `init` refuses to overwrite existing `.agent/config.json` or `.agent/state.json`.
- `snapshot` uses `checkpoint_written` because `snapshot_written` is not in the v0 event enum.
- Existing `.agent` is considered complete only when config, state, handoff, next, decisions, snapshot, and session log files all exist and validate.
- `provider`, `overnight_mode`, and `auto_continue_after_handoff` are duplicated in config/state by design for durable recovery, so status/snapshot enforce equality.
- Phase 2 uses simulated provider output in tests and does not invoke real Codex.
- `codex exec -C <repo> <prompt>` is used for supervisor start, and `codex exec -C <repo> resume <session> <prompt>` is used for supervisor same-session resume.
- Cooldown reset uses parsed reset time plus buffer, or fallback default plus buffer.
- Long waiting is still not implemented; resume returns a waiting result until `next_resume_at` unless `--allow-early` is used.
- Runner spawn errors are handled as normal provider failures, not thrown through while leaving state as `running`.

## Current Git State Summary

Git repository on branch `master`. Phase 2 changes are unstaged before final commit.

## Tests Run

- JSON parse validation for `.agent/config.json`, `.agent/state.json`, and `package.json`
- `npm run check`
- `npm test`
- `node bin/continuity.mjs status`
- `node bin/continuity.mjs status --json`
- `node bin/continuity.mjs start --dry-run test prompt`
- `node bin/continuity.mjs resume --dry-run`

## Test Result

Passed after third Phase 2 review.

## Known Risks

- Codex private session storage details can change; use them only for diagnostics, not as core truth.
- Hook packaging details should be verified again during Phase 3 and Phase 4 implementation.
- Claude Code behavior is documented but still outside v0 runtime scope.
- `tsconfig.json` exists but Phase 1 runtime uses `.mjs` because `tsc` is not installed locally.
- Phase 2 has no real long sleep/countdown yet.
- Session-id extraction is best-effort from provider output.
- Cooldown text matching is intentionally conservative to avoid classifying context/token/file-size limits as cooldown walls.

## Unfinished Work

- Commit Phase 2 if clean.
- Start Phase 3 planning after commit.

## Next Exact Steps

1. Run final verification.
2. Commit Phase 2.
3. Start Phase 3 planning.

## Do Not Redo

- Do not repeat Phase 0 research unless official docs or CLI behavior changed.
- Do not add hooks, skills, context handoff, overnight mode, or Claude Code runtime in Phase 2.
- Do not place provider-specific logic in core.

## Last Updated

2026-06-29T12:48:00Z
