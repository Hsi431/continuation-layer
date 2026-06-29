# Continuation Layer v0 Plan

This file preserves the implementation sequence for the v0 project. If official CLI behavior differs from these assumptions, update this plan before writing runtime code.

## Goal

Build a continuity protection layer for CLI coding agents.

v0 supports Codex CLI. The architecture keeps a Claude Code adapter path but does not implement full Claude Code support in v0.

## Problems

1. Cooldown wall
   - Detect usage limits, rate limits, 429s, and reset windows.
   - Write failure state.
   - Wait until reset plus buffer.
   - Resume the same session.

2. Context pressure
   - Detect impending compaction or context pressure.
   - Write durable handoff files.
   - Stop for user confirmation by default.
   - Continue automatically only when overnight mode is enabled and recovery checks pass.

## Components

- `continuation-core`: state, handoff, session chain, recovery check.
- `continuity-supervisor`: process monitor, cooldown detection, countdown, resume.
- `codex-continuity-plugin`: Codex skill and hooks.
- `providers`: adapter boundary for Codex and future Claude Code support.

## Phase 0 Corrections

- Codex same-session resume is available through `codex resume` and `codex exec resume`.
- Codex child continuation should use `codex fork` when a new session/thread is intended.
- Codex supports `SessionStart`, `Stop`, `PreCompact`, and `PostCompact` hooks for the v0 lifecycle flow.
- Codex does not currently document a `StopFailure` hook. Cooldown and API failure detection for Codex must be implemented in the supervisor by monitoring stdout, stderr, and exit behavior.
- Codex hooks should use command handlers only in v0. Prompt and agent hook handlers are not active in current Codex behavior.
- Claude Code has documented `--resume`, `--continue`, `--fork-session`, `StopFailure`, `PreCompact`, and `PostCompact` capabilities, but remains an experimental adapter skeleton in v0.
- Provider private session storage may be used for diagnostics only. Core state must stay in `.agent`.
- `block_auto_compact` is a policy flag for handoff-before-continuation. It must not try to bypass provider context management. If a provider compacts anyway, `PostCompact` records the risk and recovery prefers `.agent` files plus git state.

## Non Goals

- No GUI.
- No web dashboard.
- No multi account rotation.
- No provider limit bypass.
- No auto commit.
- No automatic PRs.
- No OpenClaw or Otter gateway integration in v0.

## Phase 0: Findings

Acceptance:

- `FINDINGS.md` exists.
- Comparable cooldown and continuation repositories are listed.
- Borrowable parser, prompt, UX, and flow ideas are listed.
- Designs that should not be borrowed are listed.
- Codex v0 path is confirmed against official docs and CLI help.
- Claude Code adapter constraints are recorded.
- No main runtime code is written.

## Phase 1: Durable State

Acceptance:

- Any git repo can initialize `.agent`.
- `status` can read state.
- Mechanical snapshot can be generated.
- State format is stable and validated.
- Existing `.agent` is not overwritten without explicit confirmation.

## Phase 2: Codex Adapter and Supervisor

Acceptance:

- Supervisor can start Codex.
- Logs are captured.
- Simulated rate limit logs transition to `cooling_down`.
- Reset time parsing and fallback reset windows work.
- Same-session resume can be invoked after cooldown with `codex resume` or `codex exec resume`.
- Cooldown detection works without any Codex failure hook.

## Phase 3: Codex Skill

Acceptance:

- Codex can load the continuity skill.
- Repo-local development skill layout follows official `.agents/skills/<skill>/SKILL.md` behavior; plugin packaging follows official `.codex-plugin/plugin.json` behavior.
- Resume starts by reading `.agent`.
- The skill directs checkpoint, resume, handoff, and compaction behavior.
- The skill does not ask Codex to auto commit.

## Phase 4: Codex Hooks

Acceptance:

- Session start can inject continuity context.
- Stop writes mechanical snapshot.
- PreCompact routes to handoff flow if supported, without trying to bypass provider context management.
- PostCompact records that compacting occurred and durable state should be preferred.
- Codex API failure and cooldown handling remains in the supervisor, not hooks.
- Hooks remain short and do not perform long sleeps.

## Phase 5: Context Handoff and Continuation

Acceptance:

- Context pressure writes handoff before continuation.
- Default mode asks the user before a child session starts.
- Codex child continuation uses `codex fork` when a new thread is required.
- Child session reads handoff, git status, and git diff.
- Recovery check failure stops continuation.

## Phase 6: Overnight Mode

Acceptance:

- Overnight mode is off by default.
- When enabled, context pressure can auto handoff and start continuation.
- Incomplete handoff or failed recovery check stops automation.
- Session chain remains traceable.

## Phase 7: Completion and Cleanup

Acceptance:

- Task can be marked complete.
- Old handoff state is archived.
- New tasks are not polluted by stale handoff files.
- Log retention and handoff rotation are documented.

## Phase 8: Claude Code Adapter Skeleton

Acceptance:

- Core does not depend on Codex.
- Claude Code provider can be selected as experimental.
- Claude Code skeleton records `--resume`, `--continue`, `--fork-session`, and `StopFailure` as provider-specific capabilities.
- Codex tests are not affected by the skeleton.
- Claude-specific limitations are documented.
