# Tests

Run:

```sh
npm test
```

Current Phase 1 coverage:

- state schema validation
- config validation
- `.agent` initialization
- existing state non-overwrite behavior
- incomplete existing state refusal
- config/state drift refusal for status and snapshot
- non-git init refusal
- status loading
- mechanical snapshot generation
- session event append during snapshot

Later phases add cooldown parsing, recovery check, and provider adapter selection coverage.
