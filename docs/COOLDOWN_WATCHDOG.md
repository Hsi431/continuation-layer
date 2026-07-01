# Cooldown Watchdog

This document is the release blocker note for the cooldown watchdog path.

## Problem Confirmation

`continuity start` is manual one-shot mode. It starts a provider process, records cooldown metadata when the process exits with a cooldown, writes `cooling_down` state, records `next_resume_at`, and exits. It does not keep a supervisor alive, sleep until reset, or automatically resume.

The cooldown path writes a mechanical snapshot. It cannot rely on a semantic handoff being written after the provider has already rejected requests. Cooldown recovery uses the latest existing `.agent/HANDOFF.md` plus `.agent/AUTO_SNAPSHOT.md`, git status, git diff stat, provider log path, current session id, `cooldown_detected_at`, `next_resume_at`, and reset provenance.

If you run `codex` directly, Continuation Layer cannot see that provider process. It cannot capture stdout/stderr cooldown text, write state, write snapshots, or automatically resume. Continuation Layer can only monitor provider processes started by `continuity start` or `continuity watch`.

Fallback reset time must not always mean "cooldown detected now plus 5 hours." The reset-time model must prefer provider reset data when the provider exposes it.

## Watch Mode

```sh
continuity watch "task"
```

`watch` means:

```text
start + cooldown wait loop + automatic same-session resume
```

Required behavior:

```text
continuity watch "task"
-> provider process runs under supervisor
-> cooldown is detected from supervised stdout/stderr
-> state becomes cooling_down
-> cooldown metadata and mechanical snapshot are written
-> foreground supervisor waits until next_resume_at
-> same Codex session is resumed automatically
-> repeated cooldowns repeat the wait/resume loop within circuit breakers
```

`continuity start` keeps manual mode:

```text
start = run once + detect cooldown + record next_resume_at + exit
```

## Reset-Time Priority

Reset time is calculated in this order:

1. Provider explicit reset timestamp, such as `resets_at`, an epoch timestamp, or `try again at ...`.
2. Provider relative reset, such as `try again in 2h 14m` or `retry after 37 minutes`.
3. Local `usage_window_started_at + 5h + buffer`.
4. Conservative fallback: `cooldown_detected_at + 5h + buffer`.

Provenance values:

- `provider_reset_at`
- `provider_relative`
- `provider_epoch`
- `usage_window_anchor`
- `cooldown_detected_fallback`
- `manual_override`
- `unknown`

Provider reset information always wins over local anchors. If the provider reset is already in the past, watch mode immediately attempts resume. `cooldown_detected_fallback` is conservative and may over-wait.

## Snapshot And Handoff Policy

Cooldown detection must write `.agent/AUTO_SNAPSHOT.md` with:

- current session id,
- provider log path,
- git status,
- git diff stat,
- `cooldown_detected_at`,
- `next_resume_at`,
- `reset_time_provenance`.

Semantic handoff is optional and cannot be created after a provider rejects requests. If a fresh checkpoint or handoff already exists, resume prompts should read it. If it does not exist, cooldown recovery still has the mechanical snapshot but must not claim a semantic handoff was written.

## Circuit Breakers

Watch mode stops instead of looping forever when:

- `watch_resume_count` reaches `max_cooldown_resumes`,
- elapsed watch time exceeds `max_watch_hours`,
- the provider fails without a cooldown,
- the current session id is missing,
- state validation fails,
- recovery checks fail,
- the user aborts with Ctrl-C.

Watch events:

- `watch_started`
- `watch_sleeping`
- `watch_resuming`
- `watch_stopped`
- `watch_aborted`
- `watch_limit_reached`

## Ctrl-C

Ctrl-C aborts watchdog automation without marking the task failed. State is preserved so the user can later run:

```sh
continuity resume
```

or restart the foreground watchdog:

```sh
continuity watch
```
