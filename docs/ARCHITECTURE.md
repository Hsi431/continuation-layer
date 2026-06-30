# Architecture

## Boundary Rule

Core state and recovery behavior must not depend on Codex-specific or Claude-specific implementation details.

## Layers

```text
CLI command
  -> supervisor
    -> provider adapter
      -> provider CLI

CLI command
  -> core state
  -> handoff files
  -> recovery check
```

## Core Responsibilities

- Load and validate `.agent/config.json`.
- Load and validate `.agent/state.json`.
- Write mechanical snapshots.
- Append session events.
- Locate latest handoff.
- Run recovery checks.
- Manage task completion and archive rules.

The v0.1 preview implements durable state validation, snapshots, recovery checks, context handoff, overnight gates, and task completion/archive cleanup. Core modules stay provider-neutral; provider-specific commands remain behind adapters.

## Supervisor Responsibilities

- Start provider CLI processes.
- Capture stdout and stderr.
- Detect cooldown failures through provider adapter.
- Parse reset time through provider adapter.
- Wait outside hook runtime.
- Resume same session or start continuation session.

The v0.1 preview implements start/resume process execution, log capture, cooldown detection, reset-time calculation, and state transitions. Long waits are not performed inside hooks; resume commands respect recorded `next_resume_at` state.

## Provider Adapter Responsibilities

- Start session.
- Resume session.
- Start continuation session.
- Extract or store session id.
- Detect cooldown messages.
- Parse reset timestamps.
- Build resume prompt.
- Build continuation prompt.

The v0.1 preview implements the Codex adapter and provider selection boundary. Claude Code remains a future provider path.

## Plugin And Hook Responsibilities

- Keep provider-specific lifecycle integration close to the provider.
- Inject continuity context on session start.
- Write short mechanical snapshots on stop.
- Request handoff before compaction when possible.
- Never block for long waits.

## Recovery Check Inputs

- `.agent/state.json`
- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/DECISIONS.md`
- `git status`
- `git diff`
- session chain events
