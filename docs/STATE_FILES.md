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
