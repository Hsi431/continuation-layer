# Dogfood Smoke Test

Use this smoke test before a preview release. It avoids real provider calls unless you intentionally remove `--dry-run`.

This repository intentionally commits a sanitized `.agent/` directory as a dogfood example. Before publishing, confirm it has no provider-private session dumps, secrets, machine-local logs, personal absolute paths, stale git status, or references to removed local files.

## 1. Prepare a test repo

```sh
mkdir /tmp/continuity-smoke
cd /tmp/continuity-smoke
git init
git commit --allow-empty -m "Initial smoke repo"
```

Use the source checkout or a linked CLI:

```sh
continuity init --task-id smoke-test
continuity status
```

Expected: `.agent/` exists, status is readable, and no provider session starts.

## 2. Watch dry-run

```sh
continuity watch --dry-run "make a harmless README edit"
continuity start --dry-run "make a harmless README edit"
```

Expected: the printed provider command uses Codex non-interactive execution and does not launch a real session. `watch` is the recommended long-lived cooldown watchdog; `start` is manual one-shot mode.

v0.1 does not ship an interactive terminal wrapper for arbitrary `codex` processes. Direct `codex` commands are outside the watchdog; use `continuity watch` or `continuity start` when cooldown monitoring is required.

## 3. Snapshot

```sh
continuity snapshot
continuity status
```

Expected: `.agent/AUTO_SNAPSHOT.md` updates and status remains valid.

## 4. Cooldown path

Run the simulated cooldown tests from the project checkout:

```sh
npm test -- tests/supervisor.test.mjs
```

Expected: cooldown detection records `cooling_down`, `next_resume_at`, reset provenance, mechanical snapshot data, foreground wait behavior, same-session automatic resume, circuit breakers, and abort behavior without calling a real provider.

Expected recovery policy: same-session cooldown resume treats stale or missing semantic handoff as a warning, while context continuation and overnight child continuation remain strict.

## 5. Continue dry-run

```sh
continuity continue --dry-run
continuity continue --yes --dry-run
```

Expected: dry-run prints the provider command that would be used for continuation and does not launch a real provider session. To exercise the handoff-writing and recovery-check path, run the non-dry-run command in a disposable test repo.

## 6. Overnight toggle

```sh
continuity overnight enable
continuity status
continuity overnight disable
continuity status
```

Expected: `overnight_mode` and `auto_continue_after_handoff` toggle on and off together.

## 7. Complete and new task

```sh
continuity complete
continuity new-task --task-id smoke-next
continuity status
```

Expected: active handoff/snapshot files are archived, active state describes the new task, and stale handoff text is not reused.

## 8. Package check

From the project checkout:

```sh
npm run format:check
npm run check
npm test
npm run pack:check
```

Expected: all commands pass, and package contents do not include `.agent/logs/` or private runtime state.
