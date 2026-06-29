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

Phase 3 Codex skill is complete and verified.

## Goal

Build Continuation Layer v0 for Codex CLI first, with a future Claude Code adapter path.

## Current Stage

Phase 3 complete. Codex continuity skill, repo-local skill entry, and plugin skill packaging are implemented, reviewed, verified, and checkpointed. Ready to commit.

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
- Confirmed current git state is clean after `ae4e82a Implement Codex supervisor basics`.
- Ran Phase 3 baseline verification: `npm test` and `npm run check` passed.
- Added Codex continuity plugin manifest at `plugins/codex-continuity/.codex-plugin/plugin.json`.
- Added continuity skill at `plugins/codex-continuity/skills/continuity/SKILL.md`.
- Added skill UI metadata at `plugins/codex-continuity/skills/continuity/agents/openai.yaml`.
- Added repo-local skill entry `.agents/skills/continuity` as a symlink to the plugin skill.
- Ran skill validator and plugin validator; both passed.
- First Phase 3 scaffold review failed because `.agent/NEXT.md` still pointed to Phase 2.
- Updated `.agent/NEXT.md` to the Phase 3 scaffold next action.
- Repeat Phase 3 scaffold review passed with no blocking findings.
- Updated `README.md` current status and repository layout for the Phase 3 continuity skill.
- Updated `plugins/codex-continuity/README.md` from placeholder text to current plugin package contents and Phase 4 hook boundary.
- First docs review failed on README context-pressure wording, stale `src/` layout wording, and stale `.agent/NEXT.md`.
- Fixed README to say continuation runtime and overnight mode are later phases.
- Fixed README `src/` layout to describe current provider adapters and supervisor.
- Updated `.agent/NEXT.md` to repeat docs review after the fix.
- Repeat docs review confirmed the README fixes but failed because `.agent/NEXT.md` still said to fix docs findings before rerunning review.
- Updated `.agent/NEXT.md` to point directly to rerunning docs-focused review.
- Final docs-focused review passed with no blocking findings.
- Final verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.
- Updated `.agent/NEXT.md` for Phase 4 planning after the Phase 3 commit.
- Ran `node bin/continuity.mjs snapshot`; `.agent/AUTO_SNAPSHOT.md`, `.agent/state.json`, and `.agent/sessions.jsonl` were updated at `2026-06-29T13:37:25.648Z`.
- Final review failed because `.agent/HANDOFF.md` still listed snapshot as unfinished and `.agent/NEXT.md` pointed to Phase 4 planning before the Phase 3 commit.
- Updated `.agent/HANDOFF.md` and `.agent/NEXT.md` so the only next action is committing the verified Phase 3 changes.
- Repeat final review passed with no blocking findings.
- Repeat final verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.

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
- `.agents/skills/continuity`
- `plugins/codex-continuity/.codex-plugin/plugin.json`
- `plugins/codex-continuity/skills/continuity/SKILL.md`
- `plugins/codex-continuity/skills/continuity/agents/openai.yaml`
- `README.md`
- `plugins/codex-continuity/README.md`

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
- Phase 3 uses one real plugin skill as the source of truth; the repo-local `.agents/skills/continuity` entry is a symlink to avoid drift.
- Phase 3 skill remains instruction-only; hooks are left for Phase 4.

## Current Git State Summary

Git repository on branch `master`. Phase 3 changes are verified, checkpointed, and ready to commit.

## Tests Run

- JSON parse validation for `.agent/config.json`, `.agent/state.json`, and `package.json`
- `npm run check`
- `npm test`
- `node bin/continuity.mjs status`
- `node bin/continuity.mjs status --json`
- `node bin/continuity.mjs start --dry-run test prompt`
- `node bin/continuity.mjs resume --dry-run`
- Phase 3 baseline `npm test`
- Phase 3 baseline `npm run check`
- `python3 /home/fnata_claw/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- `python3 /home/fnata_claw/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final `npm test`
- Final `npm run check`
- Final `python3 /home/fnata_claw/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Final `python3 /home/fnata_claw/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final `git diff --check`
- `node bin/continuity.mjs snapshot`
- Repeat final `npm test`
- Repeat final `npm run check`
- Repeat final `python3 /home/fnata_claw/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Repeat final `python3 /home/fnata_claw/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Repeat final `git diff --check`

## Test Result

Passed. Scaffold review, docs review, and final review passed after fixes. Final and repeat final tests, checks, skill validation, plugin validation, and whitespace check passed.

## Known Risks

- Codex private session storage details can change; use them only for diagnostics, not as core truth.
- Hook packaging details should be verified again during Phase 3 and Phase 4 implementation.
- Claude Code behavior is documented but still outside v0 runtime scope.
- `tsconfig.json` exists but Phase 1 runtime uses `.mjs` because `tsc` is not installed locally.
- Phase 2 has no real long sleep/countdown yet.
- Session-id extraction is best-effort from provider output.
- Cooldown text matching is intentionally conservative to avoid classifying context/token/file-size limits as cooldown walls.

## Unfinished Work

- Commit Phase 3.

## Next Exact Steps

1. Commit Phase 3.
2. Confirm post-commit worktree is clean.
3. Start Phase 4 planning only when requested.

## Do Not Redo

- Do not repeat Phase 0 research unless official docs or CLI behavior changed.
- Do not repeat Phase 3 skill work unless official docs or CLI behavior changed.
- Do not add hooks, context handoff runtime, overnight mode, or Claude Code runtime as part of the Phase 3 commit.
- Do not place provider-specific logic in core.

## Last Updated

2026-06-29T13:43:25Z
