# Tests

Run:

```sh
npm test
```

Current coverage:

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
- Codex start/resume/fork command construction
- Codex cooldown detection
- Codex reset-time parsing and fallback resume time
- supervisor stdout/stderr log capture
- simulated cooldown transition to `cooling_down`
- manual resume waiting before reset
- same-session resume after cooldown
- recovery checks over handoff, next action, git status, and git diff
- context handoff and `codex fork` child continuation command construction
- Codex hook entrypoint behavior for session start, stop, pre-compact, and post-compact
- overnight enable/disable and guarded auto-continuation
- task completion archives and new-task stale state cleanup

Future provider work should add non-Codex adapter coverage and opt-in real provider smoke tests.
