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

Phase 1 implements the first four responsibilities. Recovery check, completion, and archive rules remain later-phase work.

## Supervisor Responsibilities

- Start provider CLI processes.
- Capture stdout and stderr.
- Detect cooldown failures through provider adapter.
- Parse reset time through provider adapter.
- Wait outside hook runtime.
- Resume same session or start continuation session.

## Provider Adapter Responsibilities

- Start session.
- Resume session.
- Start continuation session.
- Extract or store session id.
- Detect cooldown messages.
- Parse reset timestamps.
- Build resume prompt.
- Build continuation prompt.

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
