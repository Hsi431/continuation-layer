# Source Layout

Runtime code started in Phase 1 with durable state, validation, snapshot, and CLI support. Phase 2 added provider adapters and supervisor runtime. Later phases added context handoff, recovery checks, confirmed child continuation, overnight gates, and the cooldown watchdog loop.

Planned modules:

```text
src/core/        durable state, handoff, recovery check
src/providers/   provider adapter interface and implementations
src/supervisor/  process monitoring, cooldown watchdog, and same-session resume
bin/             human CLI commands
```
