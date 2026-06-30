# Safety Rules

## Forbidden

- Do not bypass provider rate limits.
- Do not rotate accounts.
- Do not fake reset times.
- Do not sleep for hours inside hooks.
- Do not continue automatically from incomplete handoff state.
- Do not treat compacted transcript summaries as the only source of truth.
- Do not use compaction hooks to bypass provider context management.
- Do not discard user changes.
- Do not auto commit unless the user explicitly requests it.

## Required

- Git state is the source of truth during recovery.
- Every resume reads durable state first.
- Every continuation records parent and child session ids.
- Every handoff includes exact next steps.
- Every failure leaves a snapshot.
- Overnight mode is explicit and visible.
- Recovery check failure stops automation.
- `block_auto_compact` means handoff-before-continuation policy, not hard prevention of provider compaction.
- Default continuation stops for user confirmation before starting a child session.
- Recovery check failure stops continuation before the provider command is launched.
- Overnight auto-continuation requires explicit `overnight_mode` and `auto_continue_after_handoff`.
- New tasks must archive old active handoff state before fresh handoff files are written.

## Overnight Mode Guardrails

Automatic continuation is allowed only when:

- `overnight_mode` is true.
- `auto_continue_after_handoff` is true.
- Handoff exists and is not stale.
- `NEXT.md` exists.
- Recovery check passes.
- Parent session id is known.
- Git state has no conflicts.
- Recorded test state matches the handoff.

`continuity overnight enable` turns on both `overnight_mode` and `auto_continue_after_handoff`. `continuity overnight disable` turns both off.

## Child Continuation Guardrails

- Write `.agent/HANDOFF.md` before starting child continuation.
- Read `.agent/HANDOFF.md`, `.agent/NEXT.md`, `.agent/DECISIONS.md`, `git status --short`, and `git diff --no-color` before editing in the child session.
- Use provider-specific child continuation commands outside core; Codex uses `codex fork`.

## Cleanup Guardrails

- `continuity complete` should mark only durable task state; it must not commit or edit user project files.
- `continuity new-task` must not reuse archived handoff text as active state.
- Handoff rotation archives active handoff/snapshot pairs before replacing them.
- Log retention should remove only old `.agent/logs/` entries in a future maintenance command; hooks must not perform retention cleanup.
