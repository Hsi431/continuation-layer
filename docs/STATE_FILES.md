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
- `watch`
- `cooldown_resume`
- `context_handoff`
- `overnight`

## Event Values

- `task_created`
- `session_started`
- `checkpoint_written`
- `cooldown_detected`
- `cooldown_resumed`
- `watch_started`
- `watch_sleeping`
- `watch_resuming`
- `watch_stopped`
- `watch_aborted`
- `watch_limit_reached`
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
- `overnight_mode` and `auto_continue_after_handoff` are both false by default.
- Automatic continuation requires both `overnight_mode` and `auto_continue_after_handoff` to be true.
- `max_cooldown_resumes` defaults to `3`.
- `max_watch_hours` defaults to `18`.
- `watch_heartbeat_minutes` defaults to `30`.

## Cooldown Watchdog State

- `usage_window_started_at` records the local usage-window anchor used only when the provider does not expose reset time.
- `cooldown_detected_at` records when supervised stdout/stderr matched a cooldown.
- `reset_time_provenance` records how `next_resume_at` was calculated.
- `watch_started_at` records the current foreground watchdog start time.
- `watch_resume_count` records automatic same-session resumes in the current watch run.
- `last_watch_event` records the latest watch event.

Reset provenance values:

- `provider_reset_at`
- `provider_relative`
- `provider_epoch`
- `usage_window_anchor`
- `cooldown_detected_fallback`
- `manual_override`
- `unknown`

`cooldown_detected_fallback` means the provider did not expose a reset time and no usage-window anchor existed, so the supervisor used `cooldown_detected_at + 5h + buffer`.

## Recovery Modes

- `strict_continuation` is used for context handoff and child continuation. Missing, incomplete, or stale handoff state can fail recovery.
- `cooldown_resume` is used for same-session cooldown resume. Missing or stale semantic handoff state is recorded as a warning, while missing session id, git conflicts, unreadable git status/diff, or invalid state remain failures.
- If `continuity watch` starts while state is already `cooling_down`, it adopts that state and waits/resumes the same session instead of launching a new provider process.

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

## Phase 6 Overnight State

- `continuity overnight enable` writes `overnight_enabled` and synchronizes config/state `overnight_mode` and `auto_continue_after_handoff` to true.
- `continuity overnight disable` writes `overnight_disabled` and synchronizes both fields back to false.
- With overnight automation enabled, `continuity continue` writes handoff, runs recovery checks, and starts child continuation without `--yes`.
- Incomplete handoff, stale handoff, missing next action, missing parent session id, git conflicts, or other recovery failures record `continuation_aborted` and do not start the provider command.
- Session chain remains traceable through `continuation_started` and the following checkpoint event in `sessions.jsonl`.

## Phase 7 Completion and Cleanup

- `continuity complete` archives active `HANDOFF.md` and `AUTO_SNAPSHOT.md`, marks state `completed`, disables overnight automation, and records `task_completed`.
- `continuity new-task --task-id <id>` archives the active handoff/snapshot pair before writing fresh active handoff, next, state, and snapshot files.
- Archived handoffs are written under `.agent/handoffs/`; archived snapshots are written under `.agent/snapshots/`.
- Active handoff files should describe only the current task. Historical context belongs in archive files.
- Logs remain under `.agent/logs/`; retention is governed by `config.log_retention_days` and should be enforced by future packaging or maintenance commands rather than hooks.
