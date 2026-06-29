# Codex Continuity Plugin

Codex plugin package for the Continuation Layer v0 skill and lifecycle hooks.

Phase 3 added the continuity skill. Phase 4 adds short command hooks for session start, stop, and compaction lifecycle events.

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
- `PostCompact` records that compaction occurred and that `.agent` durable state should be preferred.

Cooldown and API failure handling remain in the supervisor. Hooks do not perform long sleeps.
