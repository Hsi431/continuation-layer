# Source Layout

Runtime code starts after Phase 0 findings are complete.

Planned modules:

```text
src/core/        durable state, handoff, recovery check
src/providers/   provider adapter interface and implementations
src/supervisor/  process monitoring and cooldown resume
src/cli/         human CLI commands
```

