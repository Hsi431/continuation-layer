# Codex Continuity Plugin

Codex plugin package for the Continuation Layer v0 skill.

Phase 3 adds the instruction-only continuity skill. It teaches Codex to use `.agent` durable state during long tasks, resumes, cooldown recovery, context pressure, handoff, and continuation sessions.

Current contents:

```text
.codex-plugin/plugin.json
skills/continuity/SKILL.md
skills/continuity/agents/openai.yaml
hooks/
```

The repo-local `.agents/skills/continuity` entry points to the packaged skill so local development and plugin packaging use the same instructions.

Hooks remain for Phase 4. Do not add hook runtime or long waits in this phase.
