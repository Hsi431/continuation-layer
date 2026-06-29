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

## Overnight Mode Guardrails

Automatic continuation is allowed only when:

- `overnight_mode` is true.
- Handoff exists and is not stale.
- `NEXT.md` exists.
- Recovery check passes.
- Git state has no conflicts.
- Recorded test state matches the handoff.

## Child Continuation Guardrails

- Write `.agent/HANDOFF.md` before starting child continuation.
- Read `.agent/HANDOFF.md`, `.agent/NEXT.md`, `.agent/DECISIONS.md`, `git status --short`, and `git diff --no-color` before editing in the child session.
- Use provider-specific child continuation commands outside core; Codex uses `codex fork`.
