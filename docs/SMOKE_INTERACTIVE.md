# Interactive Wrapper Smoke Test

This smoke test is manual and Linux-first. It is not part of CI.

Use a disposable repository when testing real Codex sessions:

```sh
mkdir /tmp/continuity-interactive-smoke
cd /tmp/continuity-interactive-smoke
git init
git commit --allow-empty -m "Initial smoke repo"
continuity init --task-id interactive-smoke
```

Use a disposable non-git directory when testing Global Shell Mode:

```sh
mkdir -p /tmp/continuity-shell-global-test
cd /tmp/continuity-shell-global-test
continuity codex
```

Expected:

- Global Shell Mode notice appears;
- Codex TUI opens in the current directory;
- no `.agent/` directory is created.

Use a disposable git repository without `.agent/` when testing the daily Codex replacement path:

```sh
mkdir -p /tmp/continuity-uninitialized-git-smoke
cd /tmp/continuity-uninitialized-git-smoke
git init
continuity codex
```

Expected:

- init guidance appears;
- Global Shell Mode starts;
- no `.agent/` directory is created.

## 1. Dry Run

```sh
continuity codex --dry-run
continuity codex --dry-run "explain this repo"
continuity codex --global --dry-run
continuity shell --dry-run
```

Expected:

- command prints a top-level interactive Codex command;
- no Codex process starts;
- no `.agent` cooldown state is written in Project Shell Mode;
- outside git, the command uses Global Shell Mode and targets the current working directory.

## 2. Open Codex TUI In Project Shell Mode

```sh
continuity codex
```

Expected:

- Codex opens in an interactive terminal UI;
- typing works normally before cooldown detection;
- repo-local `.agent` state records interactive shell events;
- exiting Codex restores terminal raw mode.

Project Shell Mode works in any initialized git repository, not only this repository. Run this once
per project before expecting `.agent/` project continuity:

```sh
continuity init --task-id <task-id>
```

If the terminal is left in a bad state:

```sh
stty sane
reset
```

## 3. Resize

While Codex is open under `continuity codex`, resize the terminal window.

Expected:

- Codex redraws coherently;
- text input still works after resize;
- wrapper does not exit.

## 4. Ctrl-C Before Cooldown

Press Ctrl-C during a normal interactive session.

Expected:

- Codex receives the interrupt;
- terminal is restored after exit;
- no fake cooldown state is written.

## 5. Cooldown Fixture Path

Use a fake PTY test or controlled fixture before trying real provider cooldown behavior:

```sh
npm test -- tests/interactive-runner.test.mjs
```

Expected:

- cooldown text from PTY output is detected after ANSI stripping;
- `.agent/state.json` becomes `cooling_down`;
- `.agent/AUTO_SNAPSHOT.md` is written;
- `sessions.jsonl` records `interactive_cooldown_detected`;
- if Codex exits after cooldown, wrapper treats it as already paused and waits until `next_resume_at`;
- after Enter confirmation, wrapper waits until `next_resume_at` when Codex exits cleanly;
- if Codex does not exit after Enter, wrapper times out safely and keeps `cooling_down` state;
- in `--unattended` mode, wrapper auto-pauses Codex without Enter and proceeds to wait/resume;
- if unattended graceful pause fails, wrapper terminates the Codex child and still proceeds to
  wait/resume;
- wrapper launches interactive `codex resume <session_id>` when a session id exists;
- wrapper falls back to `codex resume --last` when no explicit session id exists.

## 6. Unattended Mode

```sh
continuity codex --unattended
continuity codex --overnight
```

Expected:

- cooldown detection does not wait for Enter;
- wrapper prints that unattended mode is enabled;
- Codex child is paused automatically;
- wrapper waits until `next_resume_at` and resumes.

## 7. Restart During Cooldown

After an interactive cooldown has been recorded, stop the wrapper before resume, then run:

```sh
continuity codex
```

Expected:

- wrapper adopts existing interactive `cooling_down` state;
- wrapper does not start a new Codex task;
- if `next_resume_at` is in the future, wrapper waits;
- if `next_resume_at` is in the past, wrapper resumes immediately.

## 8. Global Shell Mode

```sh
mkdir -p /tmp/continuity-shell-global-test
cd /tmp/continuity-shell-global-test
continuity codex
```

Expected:

- the Global Shell Mode notice appears before Codex starts;
- Codex TUI opens;
- cooldown detection, waiting, and best-effort `codex resume --last` remain enabled;
- `.agent/` is not created.

Force Global Shell Mode inside a git repository:

```sh
continuity codex --global
```

Expected:

- Project `.agent/` state is not used;
- user-level global shell state is used.

## Troubleshooting

No TTY:

```text
continuity codex requires an interactive TTY.
Use continuity watch for non-interactive tasks.
```

Use `continuity watch "task"` for non-interactive long-running tasks.

`node-pty` install issue:

```sh
npm ci
npm rebuild node-pty
```

Resume target unknown:

- prefer explicit session id when available;
- fallback is `codex resume --last`;
- `--last` is best-effort and depends on Codex's current session selection behavior.

Direct Codex limitation:

```sh
codex
```

Direct already-running Codex sessions cannot be adopted by Continuation Layer. Start interactive
work through:

```sh
continuity codex
```

Alias:

```sh
continuity shell
```
