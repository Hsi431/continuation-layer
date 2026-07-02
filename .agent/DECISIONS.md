# Decisions

## Decision: Phase 0 before runtime code

Reason: The plan depends on provider CLI, plugin, skill, and hook capabilities that must be verified.

Date: 2026-06-29

Related files:

- `FINDINGS.md`
- `PLAN.md`

Consequence: Runtime implementation starts only after findings are complete.

## Decision: Provider-specific logic stays outside core

Reason: Codex and Claude Code behaviors differ and may change.

Date: 2026-06-29

Related files:

- `docs/ARCHITECTURE.md`
- `src/providers/`

Consequence: Cooldown parsing, resume commands, and hook integration live in provider adapters or plugin packages.

## Decision: Hooks must stay short

Reason: Long waits inside hooks are brittle and can block provider lifecycle execution.

Date: 2026-06-29

Related files:

- `docs/SAFETY.md`
- `plugins/codex-continuity/`

Consequence: Cooldown waiting belongs to the supervisor.

## Decision: Commit sanitized `.agent` dogfood state

Reason: The repository uses Continuation Layer on itself, but release commits must not include provider-private dumps, local runtime logs, stale git status, or personal environment details.

Date: 2026-07-01

Related files:

- `.agent/HANDOFF.md`
- `.agent/NEXT.md`
- `.agent/AUTO_SNAPSHOT.md`
- `.agent/state.json`
- `.agent/sessions.jsonl`
- `docs/DOGFOOD.md`

Consequence: `.agent` remains tracked as a dogfood example, with runtime noise scrubbed before release.

## Decision: Use node-pty behind a small runner boundary

Reason: The v0.2 interactive wrapper must run a real full-screen Codex TUI. Plain
`child_process` pipes are not enough for terminal raw mode, resize behavior, and pass-through
interaction.

Date: 2026-07-02

Related files:

- `src/interactive/pty-runner.mjs`
- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`
- `package.json`

Consequence: `node-pty` is a runtime dependency for `continuity shell`; automated tests use fake
PTY adapters so CI does not require an interactive terminal.

## Decision: Keep PTY cooldown stream detection dependency-light

Reason: Ticket 3 only needs enough ANSI/control stripping to normalize PTY output before passing it
to the existing Codex cooldown detector. Adding another dependency is not necessary yet.

Date: 2026-07-02

Related files:

- `src/interactive/stream-detector.mjs`
- `tests/stream-detector.test.mjs`

Consequence: The stream detector uses a local ANSI/control-sequence stripper and still delegates
cooldown matching to `codexAdapter.detectCooldownError`.

## Decision: Record interactive cooldown before controlling the TUI

Reason: The first safe milestone after PTY detection is durable state capture. Pausing input,
graceful shutdown, waiting, and resume have different failure modes and should be added after state
recording is proven.

Date: 2026-07-02

Related files:

- `src/interactive/cooldown-recorder.mjs`
- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: Ticket 4 writes `cooling_down` state, reset provenance, snapshot, and sessions event
when PTY output shows cooldown, but it does not yet pause, wait, or resume the interactive session.

## Decision: Do not hard-kill interactive Codex on cooldown by default

Reason: Interactive TUI state can be fragile. The safe v0.2 behavior is to stop normal input
pass-through, ask for pause confirmation, and send `SIGINT` as a graceful exit request.

Date: 2026-07-02

Related files:

- `src/interactive/shell-session.mjs`
- `src/interactive/pty-runner.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: After cooldown detection, normal input is blocked. Enter sends `SIGINT` to Codex.
Ctrl-C aborts wrapper control and preserves `.agent` cooldown state.

## Decision: Interactive cooldown resume uses top-level codex resume

Reason: The interactive wrapper must return the user to a Codex TUI. `codex exec resume` is the
non-interactive automation surface used by watchdog mode, not the right surface for an interactive
terminal wrapper.

Date: 2026-07-02

Related files:

- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: Interactive resume prefers `codex resume <session_id>` and falls back to
`codex resume --last`, recording `interactive_resume_target_provenance`.
