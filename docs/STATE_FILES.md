# `.agent` State Files

The `.agent` directory is durable task memory for the current repository.

## Files

```text
.agent/
  config.json
  state.json
  HANDOFF.md
  NEXT.md
  DECISIONS.md
  AUTO_SNAPSHOT.md
  handoffs/
  snapshots/
  logs/
  sessions.jsonl
```

## Status Values

- `idle`
- `running`
- `checkpointed`
- `cooling_down`
- `ready_for_continuation`
- `waiting_for_user`
- `continuing`
- `completed`
- `failed`

## Mode Values

- `normal`
- `cooldown_resume`
- `context_handoff`
- `overnight`

## Event Values

- `task_created`
- `session_started`
- `checkpoint_written`
- `cooldown_detected`
- `cooldown_resumed`
- `context_pressure_detected`
- `compaction_recorded`
- `handoff_written`
- `continuation_requested`
- `continuation_started`
- `continuation_aborted`
- `overnight_enabled`
- `overnight_disabled`
- `task_completed`
- `task_failed`

## Config Notes

- `block_auto_compact` means the continuation layer should route supported pre-compaction events into a handoff and stop/confirmation flow before continuing.
- `block_auto_compact` must not attempt to bypass provider context management. If compaction still occurs, `PostCompact` records the risk and recovery prefers `.agent` files plus git state.

## Phase 1 Implementation

- `continuity init` writes the default file set and refuses to overwrite existing `.agent/config.json` or `.agent/state.json`.
- `continuity init` also refuses incomplete existing state when required handoff, next, decisions, snapshot, or session log files are missing.
- `continuity status` validates config and state before printing status.
- `continuity status` rejects duplicated config/state fields when `provider`, `overnight_mode`, or `auto_continue_after_handoff` disagree.
- `continuity snapshot` writes `AUTO_SNAPSHOT.md`, updates `state.updated_at`, sets `state.last_event` to `checkpoint_written`, and appends a session event.

## Phase 5 Continuation State

- Context pressure records `context_pressure_detected`, then writes `.agent/HANDOFF.md` and records `handoff_written`.
- `continuity continue` writes a context handoff and leaves state at `waiting_for_user` unless the user confirms with `--yes`.
- `continuity continue --yes` runs recovery checks before starting a child session.
- Failed recovery records `continuation_aborted`, writes a snapshot, and does not start the provider command.
- Successful Codex child continuation records `continuation_started` and uses provider adapter `startContinuationSessionCommand`, which maps to `codex fork`.
