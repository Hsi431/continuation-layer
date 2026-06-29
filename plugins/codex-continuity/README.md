# Codex Continuity Plugin

Codex plugin package for the Continuation Layer v0 skill and lifecycle hooks.

Phase 3 added the continuity skill. Phase 4 added short command hooks for session start, stop, and compaction lifecycle events. Phase 5 adds context handoff and user-confirmed child continuation through the supervisor.

Current contents:

```text
.codex-plugin/plugin.json
hooks/codex-continuity-hook.mjs
hooks/hooks.json
skills/continuity/SKILL.md
skills/continuity/agents/openai.yaml
```

The repo-local `.agents/skills/continuity` entry points to the packaged skill so local development and plugin packaging use the same instructions.

Hook behavior:

- `SessionStart` prints compact continuity context from `.agent`.
- `Stop` writes `.agent/AUTO_SNAPSHOT.md`.
- `PreCompact` records context pressure and points the session toward handoff flow.
- Context pressure writes `.agent/HANDOFF.md` before any child continuation starts.
- `PostCompact` records that compaction occurred and that `.agent` durable state should be preferred.

Continuation behavior:

- Default mode stops for user confirmation before starting a child session.
- Confirmed Codex child continuation uses `codex fork`.
- The child prompt tells Codex to read `.agent/HANDOFF.md`, `.agent/NEXT.md`, `.agent/DECISIONS.md`, `git status --short`, and `git diff --no-color`.
- Failed recovery checks stop continuation before Codex is launched.

Cooldown and API failure handling remain in the supervisor. Hooks do not perform long sleeps.
