# Interactive Terminal Wrapper

This document records Ticket 0 research plus Ticket 1 through Ticket 3 groundwork for the planned
v0.2 interactive wrapper.

Status: `continuity shell --dry-run`, the initial PTY runner foundation, and PTY output cooldown
detection are implemented. Cooldown state recording, graceful pause, wait, and interactive resume
are not implemented yet.

## Scope

v0.2 should add a Linux-first interactive wrapper for everyday Codex terminal use:

```sh
continuity shell
```

The wrapper should launch Codex itself, connect it to a real pseudo-terminal, observe terminal output for cooldown text, write `.agent` state, wait through reset windows when it is safe to do so, and relaunch an interactive Codex resume path.

The wrapper is not a provider-limit bypass. It must wait for provider reset windows and must not rotate accounts, fake reset times, auto commit, auto PR, or modify Codex itself.

Ticket 1 added the dry-run command path:

```sh
continuity shell --dry-run
continuity shell --dry-run "explain repo"
```

Ticket 2 added the first non-dry-run PTY launch path. It requires an interactive TTY and fails
clearly in non-interactive environments:

```text
continuity shell requires an interactive TTY.
Use continuity watch for non-interactive tasks.
```

Ticket 3 added a stream detector that watches PTY output without changing terminal pass-through
behavior. Detection currently emits an internal callback only; it does not yet write `.agent` state,
pause Codex, wait, or resume.

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
-> continuity shell
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
4. Fail clearly when `continuity shell` is run without an interactive TTY.
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

## Cooldown Behavior Model

Case A: Codex exits after cooldown.

```text
PTY child exits
-> wrapper inspects buffered output
-> cooldown detected
-> write cooling_down state and snapshot
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
-> wait until next_resume_at
-> launch interactive resume
```

v0.2 should be conservative in Case B. It should not hard-kill Codex by default. A forced termination option can be added later or behind an explicit flag.

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
