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

v0.1 preview release polish and GitHub owner correction are complete. Latest pushed commit is `a49d93b Fix GitHub owner metadata for v0.1` on `Hsi431/continuation-layer`; CI is green. Local installation is complete: the `continuity` CLI is linked, and the Codex `codex-continuity@personal` plugin is installed and enabled.

## Goal

Build Continuation Layer v0 for Codex CLI first, with a future Claude Code adapter path.

## Current Stage

v0.1 preview is ready for tag/release when requested. Current local machine can use `continuity` directly, and new Codex sessions can load the installed continuity plugin/skill/hooks.

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
- Confirmed current git state was clean after `e2c0f48 Implement Codex continuity skill`.
- Ran Phase 4 baseline verification: `npm test` and `npm run check` passed.
- Fetched the current Codex manual via the local OpenAI docs helper; hook docs confirmed command handlers, short timeouts, `SessionStart`, `Stop`, `PreCompact`, and `PostCompact`.
- Added provider-neutral core helpers to build continuity context, record pre-compact context pressure, and record post-compact compaction.
- Added `compaction_recorded` to durable event validation and docs.
- Added Codex plugin `hooks/hooks.json` for `SessionStart`, `Stop`, `PreCompact`, and `PostCompact`.
- Added short Codex hook command script with no long sleeps and no cooldown/API failure handling.
- Added focused tests for continuity context injection text, pre-compact state transition, post-compact event recording, hook handler config, and non-blocking hook script contract.
- Updated README and plugin README for Phase 4 hook behavior.
- First Phase 4 local verification passed: `npm test` and `npm run check`.
- First Phase 4 review failed on hook config location, plugin-relative command path, JSON stdout contract, and stdin payload parsing.
- Moved hook config to `plugins/codex-continuity/hooks/hooks.json`.
- Changed hook commands to use `${PLUGIN_ROOT}`.
- Made the hook script self-contained inside the plugin package.
- Changed hook output to JSON `systemMessage` payloads.
- Restored documented stdin JSON payload parsing with bounded read time and env/argv fallbacks.
- Added tests for JSON hook output and stop snapshot behavior through the hook entrypoint.
- Tightened hook CLI error handling so malformed payloads no-op instead of crashing the hook.
- Second Phase 4 review failed because `SessionStart` used `systemMessage` instead of `hookSpecificOutput.additionalContext`.
- Fixed `SessionStart` output to inject model-visible continuity context through `hookSpecificOutput.additionalContext`.
- Third Phase 4 review passed with no blocking findings.
- Final Phase 4 verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.
- Confirmed clean post-Phase 4 baseline after commit `528b972 Implement Codex hooks`.
- Ran Phase 5 baseline: `git status --short` clean, `npm test` passed, and `npm run check` passed.
- Added context handoff generation before continuation.
- Added provider-neutral recovery check reading `.agent/HANDOFF.md`, `.agent/NEXT.md`, `git status --short`, and `git diff --no-color`.
- Added `continueManagedSession` supervisor flow: default mode writes handoff and waits for user confirmation; confirmed mode runs recovery before launching a child session.
- Wired CLI `continuity continue` and `continuity continue --yes`.
- Kept Codex child continuation on provider adapter `startContinuationSessionCommand`, which maps to `codex fork`.
- Updated Codex continuation prompt so child sessions read handoff, next, decisions, git status, and git diff before editing.
- Added tests for default confirmation, Codex fork child continuation, recovery abort, recovery check reads, and context pressure handoff.
- Updated README, source layout docs, state docs, safety docs, plugin README, and continuity skill for Phase 5 behavior.
- First Phase 5 segment 1 review failed because the packaged Codex PreCompact hook had a local `recordContextPressure` implementation that did not write `.agent/HANDOFF.md` or append `handoff_written`.
- Fixed packaged hook runtime so PreCompact writes context handoff, appends `handoff_written`, and snapshots the handoff state.
- Updated hook test to exercise `runHookCli(['pre-compact'])` instead of only the core helper.
- Reran `npm test`, `npm run check`, and `git diff --check`; all passed after the fix.
- Repeat Phase 5 review passed with no blocking findings.
- Final verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.
- Committed Phase 5 as `8bbd94b Implement context handoff continuation`.
- Confirmed post-Phase 5 worktree was clean.
- Started Phase 6 planning for overnight mode.
- Refreshed `.agent/HANDOFF.md` and `.agent/NEXT.md` after the Phase 5 commit.
- Added `setOvernightMode` to synchronize `.agent/config.json` and `.agent/state.json`.
- Added CLI `continuity overnight enable` and `continuity overnight disable`.
- Added supervisor auto-continuation gate: no-confirmation continuation only runs when `overnight_mode` and `auto_continue_after_handoff` are both true.
- Kept default `continuity continue` behavior waiting for confirmation when overnight automation is off.
- Added incomplete handoff validation to recovery checks.
- Added tests for default-off overnight mode, enable/disable state sync, auto continuation, disabled auto-continue gate, recovery abort, incomplete handoff, and session chain traceability.
- Updated README, source layout docs, state docs, safety docs, plugin README, and continuity skill for Phase 6 behavior.
- Ran `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`; all passed.
- First Phase 6 review failed because overnight auto-continuation could launch without a known parent session id.
- Added an auto-only parent session id guard before launching provider continuation.
- Added a test proving overnight auto-continuation aborts without a parent session id and does not call the provider runner.
- Updated docs and skill text to require a known parent session id for unattended continuation.
- Reran `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`; all passed after the fix.
- Repeat Phase 6 review passed with no blocking findings.
- Final verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.
- Committed Phase 6 as `345f1f8 Implement overnight continuation mode`.
- Confirmed post-Phase 6 worktree was clean.
- Rewrote `README.md` for open-source positioning, quick start, safety boundaries, Codex integration, and roadmap.
- Added `README.zh-TW.md` with Traditional Chinese positioning, usage, current status, and v1 direction.
- Linked English and Traditional Chinese README files to each other.
- Docs-only review passed with no blocking findings.
- Verification passed: `npm test`, `npm run check`, and `git diff --check`.
- Committed README open-source preparation as `531ac2f Prepare open source README`.
- Confirmed post-README worktree was clean.
- Started Phase 7 completion and cleanup.
- Added `completeTask` to mark state completed, disable overnight automation, archive active handoff/snapshot, write completed handoff, and record `task_completed`.
- Added `startNewTask` to archive current active handoff/snapshot, reset state/session fields, write fresh handoff/next/snapshot, and record a new `task_created` event.
- Added CLI `continuity complete` and `continuity new-task --task-id <id>`.
- Added archive paths for `.agent/handoffs/` and `.agent/snapshots/`.
- Added tests for task completion archives and new task stale-handoff cleanup.
- Updated README, Traditional Chinese README, state docs, and safety docs for Phase 7 cleanup, handoff rotation, and log retention boundaries.
- Ran `npm test`, `npm run check`, and `git diff --check`; all passed.
- First Phase 7 review failed because `completeTask` and `startNewTask` could archive into missing `.agent/handoffs/` or `.agent/snapshots/` directories for upgraded pre-Phase-7 state.
- Fixed archive flow to call `ensureAgentDirectories()` before copying archive files.
- Added regression coverage by removing archive directories before `completeTask`.
- Reran `npm test`, `npm run check`, and `git diff --check`; all passed after the fix.
- Repeat Phase 7 review passed with no blocking findings.
- Final verification passed: `npm test`, `npm run check`, skill validator, plugin validator, and `git diff --check`.
- Committed Phase 7 as `d5825c7 Implement task cleanup lifecycle`.
- Rewrote `README.md` and `README.zh-TW.md` with a clearer product/marketing pitch and updated Phase 7 status.
- Added Apache-2.0 `LICENSE`.
- Updated `package.json` with `license: Apache-2.0`, removed `private: true`, and added package `files` so `.agent` state is not included in npm tarballs.
- Updated `.gitignore` to ignore `.agent/handoffs/*` while preserving `.gitkeep`.
- Ran open-source readiness checks: tests, syntax check, skill validator, plugin validator, `git diff --check`, secret scans, large-file scan, and `npm pack --dry-run`.
- First open-source readiness review failed because README cooldown language overstated long-wait/auto-resume behavior.
- Fixed README/README.zh-TW to say cooldown reset time is recorded and same-session resume occurs when resume is invoked after reset.
- Reran `npm test`, `npm run check`, `git diff --check`, and searched for stale wait/resume wording; all passed.
- Repeat open-source readiness review passed with no blocking findings.
- Final open-source readiness verification passed: `npm test`, `npm run check`, skill validator, plugin validator, `git diff --check`, precise secret scan, large-file scan, and `npm pack --dry-run`.
- Committed and pushed open-source README/license polish as `5aa3539 Polish open source README and license`.
- Started v0.1 preview release polish baseline review.
- Baseline findings: README/README.zh-TW still contain personal `<home>/...` validator paths, package version is still `0.0.0`, CI is missing, release checklist/release notes/dogfood docs are missing, and formatting scripts/config are missing.
- Confirmed `npm pack --dry-run` currently excludes `.agent` state but still reports package version `0.0.0`.
- Confirmed repo worktree was clean before v0.1 release polish edits.
- Added Prettier as a dev dependency with `package-lock.json`.
- Added package scripts for `format`, `format:check`, and `pack:check`.
- Expanded `npm run check` to syntax-check all `.mjs` files under `src`, `tests`, and `plugins`.
- Updated package metadata to v0.1.0 with repository, bugs, homepage, keywords, and user-facing package files.
- Ran `npm run format`; this formatted source, tests, plugin files, markdown/json/yaml, and tracked `.agent` markdown/json.
- Sanitized tracked `.agent/state.json` `repo_path` from the local absolute path to `.`.
- Formatting/package segment verification passed: `npm run format:check`, `npm run check`, and `npm test`.
- Formatting/package focused subagent review passed.
- Reworked README.md and README.zh-TW.md into external v0.1 preview homepages with problem/before-after, highlights, early safety boundaries, install requirements, quick start, dry-run usage, known limitations, and v0.1/v0.x/v1 roadmap.
- Removed personal absolute paths from README, docs, and tracked `.agent` state/handoff.
- Updated stale docs so recovery checks, overnight mode, hooks, and cleanup no longer appear as future work.
- Added GitHub Actions CI at `.github/workflows/ci.yml` for `npm ci`, `npm run format:check`, `npm run check`, `npm test`, and `npm run pack:check`.
- Added `docs/RELEASE_CHECKLIST.md`, `docs/releases/v0.1.0.md`, and `docs/DOGFOOD.md`.
- Updated packaged continuity skill examples to use the installed `continuity` CLI.
- Docs/CI segment verification passed: `npm run format:check`, `npm run check`, `npm test`, `npm run pack:check`, precise path scan, precise secret scan, `git diff --check`, and large-file scan excluding `node_modules`.
- Full release readiness review failed on two documentation overclaims: `docs/DOGFOOD.md` overstated `continue --dry-run` side effects, and `docs/SAFETY.md` claimed a test-state-to-handoff comparison that recovery does not implement.
- Fixed `docs/DOGFOOD.md` to say `continue --dry-run` only prints the provider command and does not launch a provider session.
- Removed the unsupported test-state matching guardrail from `docs/SAFETY.md`.
- Post-review-fix verification passed: `npm run format:check`, `npm run check`, `npm test`, `npm run pack:check`, `git diff --check`, and targeted stale-claim search.
- Repeat full release readiness review passed with no blocking findings.
- Final verification passed: `npm ci --dry-run`, `npm run format:check`, `npm run check`, `npm test`, `npm run pack:check`, Codex skill validator, Codex plugin validator, `git diff --check`, personal path scan, precise secret scan, and large-file scan excluding `node_modules`.
- Committed and pushed v0.1 preview release polish as `bf55a21 Prepare v0.1 preview release`.
- Found the GitHub owner/remote issue after publishing: old remote and public docs pointed to the incorrect previous owner; correct owner is `Hsi431/continuation-layer`.
- Confirmed Hsi431 GitHub CLI auth is active and created `https://github.com/Hsi431/continuation-layer`.
- Changed `origin` to `https://github.com/Hsi431/continuation-layer.git`.
- Replaced public repo URLs in README, README.zh-TW, package metadata, and v0.1 release notes with `Hsi431/continuation-layer`.
- Chose `.agent` public strategy: keep the committed `.agent/` directory as an intentional sanitized dogfood example.
- Documented the `.agent` dogfood strategy in README, README.zh-TW, `docs/DOGFOOD.md`, `docs/RELEASE_CHECKLIST.md`, and `docs/releases/v0.1.0.md`.
- Owner/path/secret scans after the fix found no incorrect owner references, no personal absolute paths, and no precise secret matches.
- Final owner-fix verification passed: `git status --short`, `git remote -v`, wrong-owner grep, personal path grep, `npm run format:check`, `npm run check`, `npm test`, `npm run pack:check`, `npm pack --dry-run`, precise secret scan, `git diff --check`, remote tag check, and release list check.
- Confirmed `Hsi431/continuation-layer` is public, has the expected description/topics, and had no existing tags/releases before the first push.
- Committed and pushed owner/metadata final polish as `a49d93b Fix GitHub owner metadata for v0.1`.
- Confirmed GitHub Actions CI succeeded on `a49d93b`.
- Confirmed post-push worktree was clean.
- Confirmed local CLI install: `/home/fnata_claw/.npm-global/bin/continuity`.
- Created local personal Codex plugin marketplace at `/home/fnata_claw/.agents/plugins/marketplace.json`.
- Copied the packaged Codex plugin to `/home/fnata_claw/plugins/codex-continuity`.
- Installed Codex plugin `codex-continuity@personal`; Codex reports it as `installed, enabled` version `0.1.0`.
- Confirmed installed plugin cache at `/home/fnata_claw/.codex/plugins/cache/personal/codex-continuity/0.1.0`.
- Validated the installed cached skill and plugin; both passed.

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
- `plugins/codex-continuity/hooks/hooks.json`
- `plugins/codex-continuity/hooks/codex-continuity-hook.mjs`
- `tests/codex-hooks.test.mjs`
- `src/core/recovery.mjs`
- `tests/recovery.test.mjs`
- `docs/STATE_FILES.md`
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
- Phase 4 hooks use command handlers with explicit short timeouts.
- Hook runtime reads documented stdin JSON with a short deadline and keeps env/argv fallbacks for manual tests.
- `PostCompact` records `compaction_recorded`; recovery guidance continues to prefer `.agent` durable state.
- `SessionStart` injects model-visible continuity context with `hookSpecificOutput.additionalContext`.

## Current Git State Summary

Git repository on branch `master`. Latest committed baseline is `5aa3539 Polish open source README and license`, pushed to `origin/master`. v0.1 preview release polish edits are in progress.

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
- `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final `npm test`
- Final `npm run check`
- Final `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Final `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final `git diff --check`
- `node bin/continuity.mjs snapshot`
- Repeat final `npm test`
- Repeat final `npm run check`
- Repeat final `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Repeat final `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Repeat final `git diff --check`
- Phase 4 baseline `npm test`
- Phase 4 baseline `npm run check`
- Phase 4 first local `npm test`
- Phase 4 first local `npm run check`
- Final Phase 4 `npm test`
- Final Phase 4 `npm run check`
- Final Phase 4 `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Final Phase 4 `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final Phase 4 `git diff --check`
- Phase 5 baseline `npm test`
- Phase 5 baseline `npm run check`
- Phase 5 segment 1 `npm test`
- Phase 5 segment 1 `npm run check`
- Phase 5 segment 1 post-review-fix `npm test`
- Phase 5 segment 1 post-review-fix `npm run check`
- Phase 5 segment 1 post-review-fix `git diff --check`
- Final Phase 5 `npm test`
- Final Phase 5 `npm run check`
- Final Phase 5 `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Final Phase 5 `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final Phase 5 `git diff --check`
- Phase 6 local `npm test`
- Phase 6 local `npm run check`
- Phase 6 local `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Phase 6 local `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Phase 6 local `git diff --check`
- Phase 6 post-review-fix `npm test`
- Phase 6 post-review-fix `npm run check`
- Phase 6 post-review-fix `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Phase 6 post-review-fix `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Phase 6 post-review-fix `git diff --check`
- Final Phase 6 `npm test`
- Final Phase 6 `npm run check`
- Final Phase 6 `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Final Phase 6 `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Final Phase 6 `git diff --check`
- Open-source readiness final `npm test`
- Open-source readiness final `npm run check`
- Open-source readiness final `python3 <home>/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity`
- Open-source readiness final `python3 <home>/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity`
- Open-source readiness final `git diff --check`
- Open-source readiness final precise secret scan
- Open-source readiness final large-file scan
- Open-source readiness final `npm pack --dry-run`
- v0.1 formatting/package segment `npm run format:check`
- v0.1 formatting/package segment `npm run check`
- v0.1 formatting/package segment `npm test`
- v0.1 docs/CI segment `npm run format:check`
- v0.1 docs/CI segment `npm run check`
- v0.1 docs/CI segment `npm test`
- v0.1 docs/CI segment `npm run pack:check`
- v0.1 docs/CI segment precise path scan
- v0.1 docs/CI segment precise secret scan
- v0.1 docs/CI segment `git diff --check`
- v0.1 docs/CI segment large-file scan excluding `node_modules`
- v0.1 post-review-fix `npm run format:check`
- v0.1 post-review-fix `npm run check`
- v0.1 post-review-fix `npm test`
- v0.1 post-review-fix `npm run pack:check`
- v0.1 post-review-fix `git diff --check`
- v0.1 post-review-fix targeted stale-claim search
- v0.1 final `npm ci --dry-run`
- v0.1 final `npm run format:check`
- v0.1 final `npm run check`
- v0.1 final `npm test`
- v0.1 final `npm run pack:check`
- v0.1 final Codex skill validator
- v0.1 final Codex plugin validator
- v0.1 final `git diff --check`
- v0.1 final personal path scan
- v0.1 final precise secret scan
- v0.1 final large-file scan excluding `node_modules`
- owner-fix remote check
- owner-fix wrong-owner grep
- owner-fix personal path grep
- owner-fix Hsi431 URL grep
- owner-fix precise `.agent`/docs secret scan
- owner-fix final `npm run format:check`
- owner-fix final `npm run check`
- owner-fix final `npm test`
- owner-fix final `npm run pack:check`
- owner-fix final `npm pack --dry-run`
- owner-fix final `git diff --check`
- owner-fix final wrong-owner grep
- owner-fix final personal path grep
- owner-fix final precise secret scan
- owner-fix final remote tag check
- owner-fix final release list check
- owner-fix post-push worktree check
- owner-fix GitHub Actions CI check
- local install `continuity status`
- local install `codex plugin list`
- local install cached Codex skill validator
- local install cached Codex plugin validator

## Test Result

v0.1 formatting/package review passed. First full release readiness review failed on two documentation overclaims; fixes were applied and verified. Repeat full release readiness review passed. Final verification passed. Owner/remote fix final verification passed. Owner-fix commit was pushed, CI passed, and local CLI/plugin installation was verified.

## Known Risks

- Codex private session storage details can change; use them only for diagnostics, not as core truth.
- Hook packaging details should be verified again during Phase 3 and Phase 4 implementation.
- Claude Code behavior is documented but still outside v0 runtime scope.
- `tsconfig.json` exists but Phase 1 runtime uses `.mjs` because `tsc` is not installed locally.
- Phase 2 has no real long sleep/countdown yet.
- Session-id extraction is best-effort from provider output.
- Cooldown text matching is intentionally conservative to avoid classifying context/token/file-size limits as cooldown walls.
- Hook command cwd/payload details may vary by Codex plugin loading surface; the script supports stdin payload, explicit `--cwd`, `CONTINUITY_REPO`, `INIT_CWD`, `PWD`, and current cwd, and no-ops when `.agent` is missing.
- Phase 5 default confirmation is represented by CLI `--yes`; interactive prompting is still a CLI/user workflow, not an in-process prompt.

## Unfinished Work

- Create `v0.1.0` tag/release only when explicitly requested.
- Start a new Codex thread to pick up the newly installed `codex-continuity` plugin/skill/hooks.

## Next Exact Steps

1. If publishing a release, create tag `v0.1.0`.
2. Use `docs/releases/v0.1.0.md` as the GitHub release note draft.
3. Start a new Codex session when testing the installed plugin.

## Do Not Redo

- Do not repeat Phase 0 research unless official docs or CLI behavior changed.
- Do not repeat Phase 3 skill work unless official docs or CLI behavior changed.
- Do not add Claude Code runtime as part of Phase 6.
- Do not place provider-specific logic in core.

## Last Updated

2026-06-30T08:59:03Z
