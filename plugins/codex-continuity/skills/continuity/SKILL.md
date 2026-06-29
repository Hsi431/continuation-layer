---
name: continuity
description: Use .agent durable state for long Codex tasks, resume after interruption, cooldown recovery, context pressure, handoff writing, and continuation sessions. Trigger when a task mentions continuity, resume, cooldown, compact/compaction, context pressure, handoff, continuation session, overnight mode, or working from .agent state.
---

# Continuity

Use this skill to preserve and recover task state through `.agent` durable files.

## Start Or Resume

On resume, continuation, cooldown recovery, or a long task already in progress:

1. Read `.agent/HANDOFF.md`, `.agent/NEXT.md`, and `.agent/DECISIONS.md` first.
2. Read `.agent/state.json` and `.agent/config.json` when present and relevant.
3. Run `git status --short` before editing.
4. Run `git diff` before editing if the worktree is dirty.
5. Continue from the recorded next action instead of rescanning the whole repo.
6. Inspect broader repo context only when the handoff is missing, stale, contradictory, or insufficient for the next action.

Treat `.agent` files plus git state as more reliable than a compacted transcript summary.

## Checkpoints

Write a checkpoint when a phase, meaningful subtask, or recovery step completes.

Checkpoint by updating `.agent/HANDOFF.md` with:

- Current status and exact next action.
- Files changed or inspected.
- Tests and checks actually run, with pass/fail state.
- Decisions made and risks still open.

Update `.agent/NEXT.md` when the next action changes. Update `.agent/DECISIONS.md` when a durable decision is made.

If the project has a continuity CLI, prefer its snapshot command for mechanical state:

```sh
node bin/continuity.mjs snapshot
```

Do not claim a checkpoint or test result unless the file was written or the command was run.

## Context Pressure

When context pressure, compaction, or handoff is likely:

1. Stop feature work.
2. Read current `git status --short` and `git diff`.
3. Update `.agent/HANDOFF.md`, `.agent/NEXT.md`, and `.agent/DECISIONS.md` as needed.
4. Record tests/checks already run and tests/checks still needed.
5. Ask for confirmation before starting a continuation session unless explicit overnight or auto-continuation policy is enabled and recovery checks pass.
6. For a new Codex child thread, use `codex fork`, not plain `codex resume`.

Do not try to bypass provider compaction. Prefer durable handoff files before and after compaction.

## Overnight Mode

Overnight auto-continuation is allowed only after explicit enablement:

```sh
node bin/continuity.mjs overnight enable
```

Before any automatic continuation, verify that `.agent/HANDOFF.md` is complete, `.agent/NEXT.md` has a next action, a parent session id is known, git recovery checks pass, and the provider command will use the child-continuation path. Disable unattended continuation with:

```sh
node bin/continuity.mjs overnight disable
```

## Cooldown Recovery

When a cooldown, rate limit, usage limit, 429, or reset window appears:

- Do not bypass provider limits or rotate accounts.
- Preserve the current session id and failure details when available.
- Record cooldown status, reset provenance, and next resume time in `.agent` state or handoff.
- Resume the same session after the legal reset window when the supervisor or user requests it.
- Keep long waits in the supervisor or user workflow, not in hooks.

## Editing Discipline

Before edits, verify the worktree with `git status --short` and use `git diff` when dirty. Do not overwrite or revert user changes.

Keep provider-specific behavior outside core modules. Codex-specific lifecycle behavior belongs in Codex skill/plugin/hook/supervisor surfaces.

Run relevant tests after non-trivial edits. Report only commands actually run and their real results.

Do not automatically `git commit` unless the user explicitly asked for a commit.
