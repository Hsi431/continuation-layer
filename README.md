# Continuation Layer

[繁體中文](README.zh-TW.md)

Continuation Layer is a continuity guard for CLI coding agents.

Long agent runs fail in predictable ways: the model hits a cooldown wall, the context window compacts away the wrong details, or a new session resumes without the exact state of the task. Continuation Layer keeps durable task memory in the repository so a coding agent can stop, hand off, recover, and continue from the right place.

The v0 target is Codex CLI. Claude Code support is planned as a later provider path.

## What It Does

- Keeps durable `.agent` state inside the repo.
- Writes structured handoff, next-step, decision, snapshot, and session-chain files.
- Starts Codex under a supervisor that captures logs and detects cooldowns.
- Resumes the same Codex session after cooldown reset windows.
- Injects continuity context through Codex lifecycle hooks.
- Writes handoff before context-pressure continuation.
- Starts child continuation sessions with `codex fork`, not plain resume.
- Requires user confirmation by default before starting a child session.
- Supports explicit overnight mode with recovery gates before unattended continuation.
- Marks tasks complete and archives active handoff/snapshot state before a fresh task starts.

## Why This Exists

CLI coding agents are powerful, but their runtime state is fragile. A transcript is not enough when work spans hours, compaction, provider limits, or multiple sessions.

Continuation Layer treats local durable state as the source of truth:

- `.agent/HANDOFF.md` explains where the task is.
- `.agent/NEXT.md` records the next exact action.
- `.agent/DECISIONS.md` preserves durable decisions.
- `.agent/AUTO_SNAPSHOT.md` captures git state and runtime state.
- `.agent/sessions.jsonl` keeps the session chain traceable.

That makes recovery explicit instead of relying on memory, hidden provider storage, or a compacted summary.

## Current Status

v0 is Codex-first and usable for the core continuity flow.

Completed:

- Durable `.agent` state and validation.
- Codex adapter and supervisor.
- Cooldown detection and same-session resume.
- Codex continuity skill and plugin package.
- Codex lifecycle hooks for session start, stop, pre-compact, and post-compact.
- Context handoff and child continuation through `codex fork`.
- Guarded overnight auto-continuation.
- Task completion and cleanup.

Still planned before a polished v0 release:

- Phase 8 / v1 direction: Claude Code provider skeleton and later full Claude Code support.

## Safety Boundaries

Continuation Layer is not a provider-limit bypass.

It does not:

- rotate accounts,
- fake reset windows,
- sleep for hours inside hooks,
- auto commit user work,
- continue from incomplete handoff state,
- treat provider-private session storage as the core source of truth.

Cooldown and API failure handling stay in the supervisor. Provider-specific behavior stays out of core runtime modules.

## Quick Start

Initialize durable task state inside a git repo:

```sh
node bin/continuity.mjs init --task-id my-task
```

Inspect status:

```sh
node bin/continuity.mjs status
node bin/continuity.mjs status --json
```

Write a mechanical snapshot:

```sh
node bin/continuity.mjs snapshot
```

Run Codex under supervisor control:

```sh
node bin/continuity.mjs start "implement the next step"
```

Inspect provider commands without launching Codex:

```sh
node bin/continuity.mjs start --dry-run "task prompt"
node bin/continuity.mjs resume --dry-run
node bin/continuity.mjs continue --dry-run
```

Continue after context handoff:

```sh
node bin/continuity.mjs continue
node bin/continuity.mjs continue --yes
```

`continue` writes handoff and stops for confirmation. `continue --yes` runs recovery checks and starts a Codex child session with `codex fork`.

Enable guarded overnight automation:

```sh
node bin/continuity.mjs overnight enable
node bin/continuity.mjs continue
```

Disable it:

```sh
node bin/continuity.mjs overnight disable
```

Overnight continuation only starts when handoff, recovery, git state, and parent-session checks pass.

Mark a task complete and archive active handoff/snapshot state:

```sh
node bin/continuity.mjs complete
```

Start a fresh task without carrying stale handoff state forward:

```sh
node bin/continuity.mjs new-task --task-id next-task
```

## Codex Integration

The Codex plugin package lives in:

```text
plugins/codex-continuity/
```

It includes:

- a continuity skill,
- Codex hook configuration,
- a self-contained hook command script,
- plugin metadata.

Hook behavior:

- `SessionStart` injects compact continuity context.
- `Stop` writes `.agent/AUTO_SNAPSHOT.md`.
- `PreCompact` records context pressure and writes handoff.
- `PostCompact` records that compaction occurred and durable `.agent` state should be preferred.

## Repository Layout

```text
.agent/                         durable task state for this repo
.agents/skills/continuity       repo-local Codex skill entry
docs/                           architecture, safety, and research notes
plugins/codex-continuity/       Codex plugin package with continuity skill/hooks
plugins/claude-code-adapter/    future Claude Code adapter notes
src/                            core runtime, provider adapters, and supervisor
tests/                          unit and integration tests
FINDINGS.md                     Phase 0 findings
PLAN.md                         implementation plan
```

## Roadmap

v0:

- Release polish and packaging.
- Keep Codex as the primary supported provider.
- Keep automation guarded and explicit.

v1:

- Make Claude Code a first-class provider.
- Add Claude `--resume`, `--continue`, and `--fork-session` support.
- Use Claude `StopFailure` for provider-specific failure signals.
- Add provider smoke tests that remain opt-in.
- Improve recovery policy, circuit breaking, and handoff lifecycle.

## Development

Run tests:

```sh
npm test
```

Run syntax checks:

```sh
npm run check
```

Validate the Codex skill and plugin:

```sh
python3 /home/fnata_claw/.codex/skills/.system/skill-creator/scripts/quick_validate.py plugins/codex-continuity/skills/continuity
python3 /home/fnata_claw/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugins/codex-continuity
```
