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

## Overnight Mode Guardrails

Automatic continuation is allowed only when:

- `overnight_mode` is true.
- Handoff exists and is not stale.
- `NEXT.md` exists.
- Recovery check passes.
- Git state has no conflicts.
- Recorded test state matches the handoff.
