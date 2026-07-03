# Interactive Terminal Wrapper

This document records Ticket 0 research plus Ticket 1 through Ticket 7 groundwork for the planned
v0.2 interactive wrapper.

Status: `continuity codex --dry-run`, the PTY runner foundation, PTY output cooldown
detection/state recording, safe interactive pause, unattended pause, wait/resume, and existing
cooldown adoption are implemented.

## Scope

v0.2 should add a Linux-first interactive wrapper for everyday Codex terminal use:

```sh
continuity codex
```

`continuity shell` remains an alias for `continuity codex`.

Default mode is interactive safety mode. When cooldown is detected, the wrapper records
`cooling_down` state, blocks normal input, and asks the user to press Enter before pausing Codex.

Unattended mode is explicit:

```sh
continuity codex --unattended
continuity codex --overnight
```

In unattended mode, cooldown detection records `cooling_down`, sends `SIGINT` to Codex immediately,
waits for the pause grace period, then sends `SIGTERM` and `SIGKILL` if the child does not exit. The
top-level state remains `cooling_down`; forced child termination is recorded with
`interactive_shell_status = cooldown_child_terminated` and
`last_tty_event = unattended_pause_forced`. The wrapper then proceeds to wait/resume.

The wrapper should launch Codex itself, connect it to a real pseudo-terminal, observe terminal
output for cooldown text, write the right shell state for the current mode, wait through reset
windows when it is safe to do so, and relaunch an interactive Codex resume path.

The wrapper is not a provider-limit bypass. It must wait for provider reset windows and must not rotate accounts, fake reset times, auto commit, auto PR, or modify Codex itself.

Ticket 1 added the dry-run command path:

```sh
continuity codex --dry-run
continuity codex --dry-run "explain repo"
continuity shell --dry-run
```

Ticket 2 added the first non-dry-run PTY launch path. It requires an interactive TTY and fails
clearly in non-interactive environments:

```text
continuity codex requires an interactive TTY.
Use continuity watch for non-interactive tasks.
```

Ticket 3 added a stream detector that watches PTY output without changing terminal pass-through
behavior.

Ticket 4 records interactive cooldown state when that detector fires. It writes `cooling_down`
state, `next_resume_at`, reset provenance, `.agent/AUTO_SNAPSHOT.md`, and a sessions event, then
prints a wrapper message. It does not yet pause Codex, wait, or resume.

Ticket 5 stops normal input pass-through after interactive cooldown detection. The wrapper prompts
the user to press Enter to pause or Ctrl-C to abort. Enter sends `SIGINT` to Codex as a graceful exit
request; Ctrl-C also sends `SIGINT` and leaves the already-written cooldown state intact. The wrapper
does not hard-kill Codex by default. If Codex does not exit after the pause request, a grace timeout
aborts the wrapper safely and leaves state as `cooling_down` so the user can exit Codex manually and
rerun `continuity codex`.

Ticket 6 waits until `next_resume_at` after the user confirms pause, then launches interactive
resume. It prefers:

```text
codex resume <session_id>
```

and falls back to:

```text
codex resume --last
```

when no explicit session id is available.

Ticket 7 lets a restarted `continuity codex` or `continuity shell` adopt existing interactive
`cooling_down` state. It does not start a new Codex task. It waits until the recorded
`next_resume_at`, then launches interactive resume. If `next_resume_at` has already passed, it
resumes immediately.

The unattended path extends Ticket 5 behavior only when `--unattended` or `--overnight` is passed.
Default mode still asks for Enter on cooldown.

## Shell Modes

`continuity codex` has two modes. `continuity shell` is an alias.

| Capability                  | Project Shell Mode            | Global Shell Mode                          |
| --------------------------- | ----------------------------- | ------------------------------------------ |
| Trigger                     | git repo with valid `.agent/` | non-git, git without `.agent/`, `--global` |
| Codex launch cwd            | repository root               | current working directory                  |
| State path                  | repo-local `.agent/`          | user-level global shell state              |
| Cooldown detection          | yes                           | yes                                        |
| Wait until `next_resume_at` | yes                           | yes                                        |
| Explicit session-id resume  | yes                           | yes, only if detected from Codex output    |
| Fallback resume             | `codex resume --last`         | `codex resume --last`, best effort         |
| Git status/diff recovery    | yes                           | no                                         |
| Mechanical project snapshot | yes                           | no                                         |
| Semantic handoff            | yes                           | no                                         |
| Context/child continuation  | project continuity only       | no                                         |
| Overnight automation        | project continuity only       | no                                         |

Project Shell Mode is full project continuity for any initialized git repository. It is not specific
to the Continuation Layer repository. Run this once per project:

```sh
continuity init --task-id <task-id>
```

Then `continuity codex` uses that repository root, `.agent/state.json`,
`.agent/AUTO_SNAPSHOT.md`, `sessions.jsonl`, git status/diff recovery, and the existing interactive
cooldown adoption path.

When the current directory is inside a git repository but `.agent/` does not exist, `continuity
codex` enters Global Shell Mode by default and prints init guidance. It does not create `.agent/`.
When `.agent/` exists but required files are missing, invalid, or inconsistent, the command fails
loudly and does not fall back to Global Shell Mode.

Global Shell Mode is a cooldown wrapper for everyday `codex`-style terminal usage outside project
continuity. It does not create `.agent/`, does not run git recovery, and does not pretend that
handoff or continuation state exists. It stores only minimal global shell state and resumes with:

```text
codex resume <session_id>
```

when a session id was detected, otherwise:

```text
codex resume --last
```

`--last` is best-effort. If that resume command exits nonzero, Global Shell Mode marks the global
state as `failed` and aborts with a clear message.

Global shell state is stored under:

```text
$XDG_STATE_HOME/continuation-layer/
```

or, when `XDG_STATE_HOME` is unset:

```text
~/.local/state/continuation-layer/
```

The current files are:

```text
global-shell-state.json
global-shell-sessions.jsonl
```

Use this flag when global fallback is not wanted:

```sh
continuity codex --require-repo
```

Use this flag to force Global Shell Mode inside a git repository:

```sh
continuity codex --global
```

`--global` and `--require-repo` conflict and are rejected when passed together.

## Codex CLI Observations

Sources checked:

- local Codex CLI help from `codex --help`, `codex resume --help`, and `codex exec --help`;
- official Codex manual snapshot fetched by the OpenAI docs helper;
- local Codex CLI version: `codex-cli 0.141.0`.

Observed commands:

| Command                             | Observation                                                                                                                                                                                                                                              |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex`                             | Launches the interactive terminal UI when run without a subcommand.                                                                                                                                                                                      |
| `codex "prompt"`                    | Accepted by the top-level CLI as an optional prompt. This may start the TUI with an initial prompt or run a quick prompt path depending on current Codex behavior and configuration, so Ticket 2 must smoke-test it before relying on it for wrapper UX. |
| `codex resume`                      | Resumes a previous interactive session, using a picker by default.                                                                                                                                                                                       |
| `codex resume --last`               | Resumes the most recent recorded interactive session for the current working directory.                                                                                                                                                                  |
| `codex resume <SESSION_ID>`         | Resumes a specific interactive session id or session name.                                                                                                                                                                                               |
| `codex exec`                        | Runs Codex non-interactively and is the right surface for v0.1 `watch` automation, not for interactive TUI resume.                                                                                                                                       |
| `codex exec resume --last "prompt"` | Resumes non-interactively and should remain separate from the v0.2 interactive wrapper.                                                                                                                                                                  |

The local sandbox could run help commands safely. A no-prompt TUI launch was attempted through `script` with an isolated `CODEX_HOME`; it produced terminal control output and waited until killed by timeout. That confirms the command path reaches a TUI-like terminal mode, but it is not a complete smoke test. Real TUI smoke testing remains required before Ticket 2 acceptance.

## Resume Behavior

Interactive resume should use top-level Codex resume commands:

```sh
codex resume <SESSION_ID>
codex resume --last
```

It should not use:

```sh
codex exec resume ...
```

`codex exec resume` is for non-interactive automation. The interactive wrapper needs to return the user to an interactive Codex terminal session.

Resume target priority for v0.2:

1. `codex resume <SESSION_ID>` when `.agent/state.json` or observed Codex output provides a reliable current session id.
2. `codex resume --last` when no explicit session id is available but the wrapper is still in the same repository working directory.
3. Abort with clear instructions when neither target is safe.

The wrapper should record the target provenance:

- `explicit_session_id`
- `codex_last`
- `unknown`

`codex resume --last` is best-effort. Documentation must say that explicit session id resume is preferred.

## Wrapper Ownership Boundary

The wrapper must launch Codex itself:

```text
user terminal
-> continuity codex
-> PTY wrapper
-> codex interactive TUI
```

Continuation Layer cannot adopt an already-running direct `codex` process. If a user starts `codex` directly, the wrapper cannot reliably attach to its TTY, observe all output, control shutdown, write complete `.agent` state, or resume it after cooldown.

This v0.1 limitation remains true in v0.2:

```text
direct codex
-> not supervised by Continuation Layer
-> cooldown events are not captured by Continuation Layer
```

## PTY Approach

Interactive Codex needs a real pseudo-terminal. Plain `child_process.spawn()` pipes are not enough for full-screen terminal UI behavior.

Selected dependency:

```text
node-pty
```

Registry metadata observed for `node-pty`:

- version: `1.1.0`
- license: `MIT`
- repository: `github.com/microsoft/node-pty`
- dependency: `node-addon-api`
- unpacked size reported by npm: about 64 MB

Risk: `node-pty` is a native addon. It may affect install behavior, CI, and package footprint. Tests
avoid depending on a real PTY by using a fake PTY adapter.

Dependency strategy:

1. Implement a small PTY abstraction boundary.
2. Load `node-pty` only in the real runner.
3. Keep test coverage on fake PTY runners.
4. Fail clearly when `continuity codex` or `continuity shell` is run without an interactive TTY.
5. Revisit optional dependency behavior after Linux smoke testing if native installation becomes a
   release issue.

## Terminal Requirements

The real runner must handle:

- stdin raw mode when available;
- stdout/stderr pass-through;
- terminal resize via `SIGWINCH`;
- Ctrl-C and Ctrl-D behavior;
- child process exit;
- cleanup on normal exit, abort, and error.

Every path must restore the terminal:

```text
process.stdin.setRawMode(false)
```

The smoke docs should tell users how to recover from a broken terminal:

```sh
stty sane
reset
```

Ticket 2 coverage includes fake-PTY tests for pass-through input/output, resize handling, raw-mode
restore, and listener cleanup. A real Codex TUI smoke test is still required because automated CI
does not provide an interactive terminal.

## Stream Detection

PTY output includes ANSI escape sequences and alternate-screen control codes. Cooldown detection must not run directly against raw output.

The stream detector:

1. pass raw chunks through to the user's terminal unchanged;
2. append chunks to a capped rolling buffer, likely 16 KB or 32 KB;
3. strip ANSI/control sequences for detection;
4. normalize whitespace;
5. call the existing Codex adapter cooldown detector;
6. emit one cooldown event per cooldown episode.

Existing provider logic to reuse:

```text
codexAdapter.detectCooldownError(text)
codexAdapter.parseResetTimeDetails(text, now)
```

Ticket 3 uses a small local ANSI/control-sequence stripper instead of adding another dependency.
Tests cover plain cooldown text, ANSI-colored output, chunked output, provider false positives, one
event per cooldown episode, and rolling buffer caps.

Ticket 4 coverage verifies that fake PTY cooldown output writes:

- `status = cooling_down`
- `mode = cooldown_resume`
- `current_session_id`
- `cooldown_detected_at`
- `next_resume_at`
- `reset_time_provenance`
- `.agent/AUTO_SNAPSHOT.md`
- `interactive_cooldown_detected` sessions event
- wrapper message on stderr

Ticket 5 coverage verifies:

- normal input is blocked after cooldown detection
- Enter sends a graceful `SIGINT` pause request
- Ctrl-C aborts wrapper control while preserving `cooling_down` state
- raw PTY pass-through remains unchanged before cooldown detection

Ticket 6 coverage verifies:

- wait until `next_resume_at`
- interactive resume uses `codex resume <session_id>`
- missing session id falls back to `codex resume --last`
- `interactive_resume_target_provenance` is recorded
- `watch_resume_count` increments for automatic interactive resumes
- PTY pass-through resumes in a second PTY run

Ticket 7 coverage verifies:

- existing interactive `cooling_down` state is adopted
- expired `next_resume_at` resumes immediately
- missing `next_resume_at` aborts without starting Codex
- non-interactive `cooling_down` state is not adopted by `continuity codex` or `continuity shell`

Blocker coverage verifies:

- cooldown output followed by child exit is treated as already paused and proceeds to wait/resume
- pause `SIGINT` that does not exit Codex before the grace timeout aborts safely without resuming

## Cooldown Behavior Model

Case A: Codex exits after cooldown.

```text
PTY output contains cooldown text
-> cooldown detected
-> PTY child exits
-> write cooling_down state and snapshot
-> treat child exit as already paused
-> wait until next_resume_at
-> launch interactive resume
```

Case B: Codex stays open but displays cooldown.

```text
PTY output contains cooldown text
-> detector emits cooldown_detected once
-> wrapper records cooling_down state and snapshot
-> wrapper stops normal input pass-through
-> user confirms pause or aborts
-> wrapper attempts graceful shutdown
-> if Codex exits, wait until next_resume_at
-> launch interactive resume
```

If Codex does not exit before the pause grace timeout, the wrapper stops waiting on the child,
preserves `cooling_down` state, and tells the user to exit Codex manually before rerunning
`continuity codex`. v0.2 does not hard-kill Codex by default. A forced termination option can be
added later or behind an explicit flag.

## State Notes

Interactive state should be added narrowly and should not change the meaning of the existing top-level task `status`.

Potential fields:

```json
{
  "interactive_shell_started_at": null,
  "interactive_shell_pid": null,
  "interactive_shell_status": null,
  "interactive_resume_target": null,
  "interactive_resume_target_provenance": null,
  "last_tty_event": null,
  "last_detected_cooldown_text_hash": null
}
```

Potential statuses:

```text
idle
running
cooling_down
waiting_for_resume
resuming
exited
aborted
failed
```

## Known Risks

- Real cooldown text visibility from Codex TUI stdout is not proven yet. Fake PTY tests can prove wrapper behavior, but real provider smoke testing is still required.
- `codex "prompt"` behavior needs a real smoke test before the wrapper promises initial-prompt UX.
- `node-pty` native install behavior may affect CI and user installation.
- Alternate-screen terminal behavior can hide useful debug output; `--no-alt-screen` may be useful for manual smoke tests but should not be forced by default without testing.
- `codex resume --last` is best-effort and can choose the wrong session if Codex's current-working-directory filtering changes.
- The wrapper cannot attach to already-running direct Codex sessions.

## Ticket 0 Acceptance

Confirmed for v0.2 planning:

1. The wrapper must launch Codex itself.
2. Direct already-running `codex` cannot be adopted by Continuation Layer.
3. Interactive resume should use `codex resume`, not `codex exec resume`.

Ticket 1 is complete. Ticket 2 has added the PTY foundation and fake-PTY tests, but still needs a
manual Linux terminal smoke test before calling the runtime path fully accepted.
