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

Consequence: `node-pty` is a runtime dependency for the interactive Codex wrapper; automated tests
use fake PTY adapters so CI does not require an interactive terminal.

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

## Decision: continuity shell adopts only interactive cooldown state

Reason: `continuity watch` and `continuity shell` are different supervision paths. Restarting the
interactive wrapper should recover an interrupted interactive wait, but it should not steal a
non-interactive watchdog cooldown.

Date: 2026-07-02

Related files:

- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: `continuity shell` adopts `cooling_down` only when interactive metadata is present. A
non-interactive `cooling_down` state is rejected with guidance to use `continuity watch` or
`continuity resume`.

## Decision: Treat interactive cooldown child exit as already paused

Reason: Codex may display cooldown text and exit on its own. Requiring Enter after the child has
already exited would prevent the wrapper from waiting and resuming.

Date: 2026-07-03

Related files:

- `src/interactive/shell-session.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: If cooldown was recorded and the PTY child exits without user confirmation, the wrapper
treats that as a completed pause and proceeds to wait/resume.

## Decision: Add interactive pause grace timeout without hard kill

Reason: Codex may treat `SIGINT` as cancel input instead of exiting the TUI. The wrapper must not
wait forever, but v0.2 should stay conservative and avoid hard-killing Codex by default.

Date: 2026-07-03

Related files:

- `src/interactive/shell-session.mjs`
- `src/interactive/pty-runner.mjs`
- `tests/interactive-runner.test.mjs`

Consequence: After Enter sends `SIGINT`, the wrapper waits for a grace timeout. If Codex still has
not exited, the wrapper aborts safely, leaves `cooling_down` state intact, and tells the user to
exit Codex manually before rerunning `continuity codex`.

## Decision: Global Shell Mode is cooldown wrapping, not project continuity

Reason: `continuity shell` is meant to replace everyday `codex` usage and must run outside git
repositories, but project recovery features require `.agent/` and git state.

Date: 2026-07-02

Related files:

- `src/interactive/shell-session.mjs`
- `src/interactive/global-shell-state.mjs`
- `bin/continuity.mjs`
- `tests/interactive-runner.test.mjs`
- `tests/supervisor.test.mjs`
- `docs/INTERACTIVE_WRAPPER.md`

Consequence: Outside git, the interactive Codex wrapper stores minimal state under the user-level
Continuation Layer state directory and only supports cooldown detection, waiting, and best-effort
interactive Codex resume. It does not create `.agent/`, run git recovery, write project snapshots,
or provide handoff/continuation/overnight semantics.

## Decision: Keep watch repo-bound

Reason: `continuity watch` writes `.agent` state and depends on git recovery checks.

Date: 2026-07-02

Related files:

- `src/supervisor/supervisor.mjs`
- `bin/continuity.mjs`
- `tests/supervisor.test.mjs`

Consequence: `continuity watch` still fails outside git and points users to `continuity codex` for
global interactive cooldown wrapping.

## Decision: continuity codex is the primary interactive wrapper entrypoint

Reason: The interactive wrapper is meant to replace everyday direct `codex` usage, and `shell` is
too generic for that user-facing workflow.

Date: 2026-07-02

Related files:

- `bin/continuity.mjs`
- `README.md`
- `docs/INTERACTIVE_WRAPPER.md`
- `docs/SMOKE_INTERACTIVE.md`
- `tests/docs-cli.test.mjs`

Consequence: `continuity codex` is documented and listed first in help. `continuity shell` remains
an alias that uses the same runtime path.
