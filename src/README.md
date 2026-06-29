# Source Layout

Runtime code started in Phase 1 with durable state, validation, snapshot, and CLI support.

Planned modules:

```text
src/core/        durable state, handoff, recovery check
src/providers/   provider adapter interface and implementations
src/supervisor/  process monitoring and cooldown resume
src/cli/         human CLI commands
```
