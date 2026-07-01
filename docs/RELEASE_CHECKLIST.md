# Release Checklist

Use this checklist before publishing a v0.x preview release.

## Version and Metadata

- Bump `package.json` version.
- Confirm `package-lock.json` matches the package version.
- Confirm `license`, `repository`, `bugs`, `homepage`, `keywords`, `bin`, `engines`, and `files` are present.
- Confirm `README.md` and `README.zh-TW.md` describe the same release status.
- Confirm repository metadata points to `Hsi431/continuation-layer`.

## Local Verification

```sh
npm ci
npm run format:check
npm run check
npm test
npm run pack:check
```

## README and Docs

- Quick Start works from a fresh git repo.
- Install section lists Node >= 20, Codex CLI, and git requirements.
- Safety boundaries still say no account rotation, no provider-limit bypass, no long hook sleeps, and no auto commit.
- README recommends `continuity watch` for long-running tasks and labels `continuity start` as manual one-shot mode.
- README separates recommended watch mode, manual start/resume mode, and planned interactive terminal wrapper work.
- `docs/COOLDOWN_WATCHDOG.md` documents reset provenance, direct Codex limitations, snapshot policy, circuit breakers, and Ctrl-C behavior.
- Cooldown same-session recovery treats stale semantic handoff as a warning, while context continuation and overnight child continuation remain strict.
- Known limitations clearly label Claude Code as future/v1.
- Known limitations clearly say direct `codex` processes cannot be monitored.
- README does not contain personal absolute paths.
- `docs/DOGFOOD.md` matches the current CLI.
- Release notes exist under `docs/releases/`.
- The committed `.agent/` state is either removed or clearly documented as an intentional dogfood example.

## Package Hygiene

- `npm pack --dry-run` does not include `.agent/logs/`.
- Package does not include generated private state, temp files, coverage, `node_modules`, env files, provider session dumps, or secrets.
- Package includes runtime code, docs, README files, license, and plugin assets needed by users.

## Security and Privacy

- Run a precise secret scan on the current tree.
- Confirm broad secret-word hits are false positives or documented terms.
- Confirm no personal machine paths remain in public README/docs.
- Confirm no incorrect GitHub owner references remain.
- Confirm committed `.agent/` files contain no secrets, provider-private session dumps, machine-local logs, or personal absolute paths.
- Confirm committed `.agent/` files contain no stale git status, removed file references, or one-off runtime noise.
- Confirm `.env` files are ignored.

## GitHub Release

- Tag format: `v0.1.0`.
- Release title format: `Continuation Layer v0.1.0 Preview`.
- Release notes include completed features, safety boundaries, install notes, known limitations, and roadmap.
- CI is green on the release commit.
- No tag or release already exists for the target version before publishing.
