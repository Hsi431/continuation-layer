# Source Layout

Runtime code started in Phase 1 with durable state, validation, snapshot, and CLI support. Phase 2 added provider adapters and supervisor runtime. Phase 5 adds context handoff, recovery checks, and confirmed child continuation.

Planned modules:

```text
src/core/        durable state, handoff, recovery check
src/providers/   provider adapter interface and implementations
src/supervisor/  process monitoring and cooldown resume
bin/             human CLI commands
```
