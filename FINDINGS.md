# Phase 0 Findings

Status: complete.
Last updated: 2026-06-29T08:03:27Z

This file is the required Phase 0 output. It records the official CLI capabilities and comparable implementations inspected before writing supervisor, adapter, hook, or plugin runtime code.

## Executive Findings

- Codex v0 is feasible with separate paths for same-session resume and child continuation.
- Codex same-session resume should use `codex resume` for interactive sessions and `codex exec resume` for non-interactive supervisor automation.
- Codex child continuation should use `codex fork` when a new thread is required.
- Codex supports skills, plugins, and lifecycle hooks, including `SessionStart`, `Stop`, `PreCompact`, and `PostCompact`.
- Codex docs do not show a `StopFailure` or failure hook equivalent. Cooldown and API failure detection must live in the supervisor by monitoring process output and exit behavior.
- Codex hooks should be command hooks only for v0. The manual says prompt and agent handlers are parsed but skipped, and async command hooks are not supported today.
- Claude Code has a clearer future adapter path for failure events: its docs include `StopFailure`, rate-limit matcher values, `PreCompact`, `PostCompact`, `--resume`, `--continue`, and `--fork-session`.
- Existing repos are useful for cooldown parsing, session ID preservation, handoff shape, and terminal UX, but none should become the core architecture.

## Official Codex Capabilities

| Capability | Confirmed behavior | Source | Impact |
| --- | --- | --- | --- |
| resume same session | `codex resume [SESSION_ID] [PROMPT]`, `codex resume --last`, and `codex exec resume [SESSION_ID] [PROMPT]` are available. | `codex --help`, `codex resume --help`, `codex exec resume --help`, OpenAI Codex CLI manual | Supervisor can resume the same session after cooldown. |
| child continuation | `codex fork [SESSION_ID] [PROMPT]` creates a new thread from a previous session while preserving the original transcript. | OpenAI Codex CLI manual | Context handoff continuation should use fork, not plain resume, when a child session is intended. |
| plugin support | `codex plugin` manages installed plugins; plugin projects use `.codex-plugin/plugin.json`. | `codex plugin --help`, OpenAI Codex plugin docs | `codex-continuity-plugin` can be packaged as a plugin after core state is stable. |
| skill support | Skills use `SKILL.md` with frontmatter `name` and `description`; repo skills can live under `.agents/skills`, and plugins can distribute skills. | OpenAI Codex skills docs | Phase 3 should implement a continuity skill using official skill layout. |
| hook support | Hooks include `SessionStart`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `UserPromptSubmit`, `SubagentStart`, `SubagentStop`, and `Stop`. | OpenAI Codex hooks docs | Phase 4 can wire session start, stop snapshot, and compaction handoff flow. |
| failure hook | No documented Codex `StopFailure` or equivalent was found. | OpenAI Codex hooks docs and CLI help | Do not rely on Codex hooks for cooldown failure capture. Supervisor owns this. |
| hook handler limits | Command handlers run today. Prompt and agent handlers are parsed but skipped, and async command hooks are unsupported. | OpenAI Codex hooks docs | v0 hooks must be short command scripts with bounded runtime. |
| compact lifecycle | `PreCompact` and `PostCompact` exist with matchers `manual` and `auto`. | OpenAI Codex hooks docs | Context pressure handoff can be routed through compaction hooks. |
| session storage | Codex session JSONL files are stored under `CODEX_HOME` / `~/.codex/sessions` by date, with rollout filenames containing the thread ID. | `cli-continues` Codex parser docs and source, verified as implementation research | Useful for log correlation, but adapter should not depend on private storage as the primary API. |

## Official Claude Code Capabilities

| Capability | Confirmed behavior | Source | Impact |
| --- | --- | --- | --- |
| resume same session | `claude --resume [value]` resumes by session ID or picker. | `claude --help`, Claude Code CLI docs | Future adapter can support explicit resume. |
| continue recent session | `claude --continue` continues the most recent conversation in the current directory. | `claude --help`, Claude Code CLI docs | Useful fallback if no explicit session ID is available. |
| child continuation | `--fork-session` creates a new session ID when used with `--resume` or `--continue`. | `claude --help` | Maps well to context handoff continuation. |
| named sessions | CLI supports `--name` / `-n`. | `claude --help` | Future adapter can expose named session workflows later. |
| plugin support | CLI supports plugin sources through `--plugin-dir` and `--plugin-url`. | `claude --help` | Skeleton can leave plugin packaging behind an experimental provider profile. |
| skill support | Personal skills live under `~/.claude/skills`, project skills under `.claude/skills`, and plugin skills under plugin `skills/`. | Claude Code skills docs | Claude skill packaging differs from Codex and must stay adapter-specific. |
| hook support | Hooks include `SessionStart`, `Stop`, `StopFailure`, `PreCompact`, `PostCompact`, and `SessionEnd`. | Claude Code hooks docs | Future Claude adapter can use failure hooks more directly than Codex. |
| failure hook matchers | `StopFailure` can match error types such as `rate_limit`, `overloaded`, `authentication_failed`, `billing_error`, and `server_error`. | Claude Code hooks docs | Future cooldown detection can combine hook data with supervisor logs. |
| compact lifecycle | `PreCompact` and `PostCompact` support `manual` and `auto` matchers. | Claude Code hooks docs | Claude skeleton can share the core handoff state machine. |

## Comparable Repos Inspected

| Repo | What was inspected | Borrowable | Do not borrow | Notes |
| --- | --- | --- | --- | --- |
| `Maciek-roboblog/Claude-Code-Usage-Monitor` | Official statusline parsing, state protocol, exit codes, local usage warehouse, reset metadata. | Provenance labels, machine-readable status output, reset timestamp handling, automation exit code style. | Claude-specific billing model as core state. | Strong reference for distinguishing official quota data from estimates. |
| `aqua5230/usage` | Local Claude/Codex quota monitor and optional Progress Concierge handoff/resume UX. | Menu/status UX concepts and off-by-default continuation posture. | AGPL code, macOS-only assumptions, direct code reuse. | License makes it design-reference only. |
| `yigitkonur/cli-continues` | Cross-tool session discovery, Codex parser docs, structured handoff export, native resume dispatch. | Handoff sections, verbosity presets, session storage research, native-resume command mapping. | Parser-centric core architecture and cross-tool breadth in v0. | Good source for Codex session JSONL layout, with private-storage caveats. |
| `frankbria/ralph-claude-code` | Autonomous loop, rate-limit detection, session ID persistence, circuit breaker, tmux monitor UX. | Multi-layer limit detection, false-positive filtering, session ID preservation, circuit-breaker concepts. | Autonomous coding loop as project core, broad task runner model, direct Claude-specific flow. | Useful for robustness patterns, not architecture. |
| `Loongphy/codex-auth` and similar account tools | Account-switching / auth helper category. | None for v0. | Account rotation, bypass patterns, multi-account limit avoidance. | Explicitly out of scope and unsafe for this project. |

## Borrowable Designs

- Layered cooldown detection: structured provider event first, tail-filtered text fallback second, conservative default reset window last.
- Preserve session IDs only after successful provider output; do not overwrite a known-good session ID with an error result.
- Filter echoed user/tool text when scanning logs for limit phrases to avoid false positives.
- Keep a machine-readable local state file separate from human-readable handoff markdown.
- Use provenance labels for reset data: official, parsed, fallback, or unknown.
- Use explicit automation exit codes for future scripting.
- Keep handoff short, structured, and focused on next steps, files touched, tests run, and decisions.
- Borrow continuation prompt shape: require the next session to read handoff, read `NEXT.md`, inspect git status/diff, run recovery check, then continue only from the recorded next action.
- Borrow resume prompt shape: state the task ID, session ID, last failure reason, reset provenance, and first inspection command before asking the provider CLI to resume.
- Keep continuation opt-in by default and make unattended continuation an explicit mode.
- Keep a circuit-breaker concept for repeated no-progress or same-error loops.
- Keep terminal/tmux/countdown UX in the supervisor, not in hooks.

## Rejected Designs

- Do not fork any comparable repo as the project core.
- Do not copy AGPL implementation code.
- Do not implement account rotation or provider-limit bypass.
- Do not make provider private storage the only source of truth.
- Do not run long sleeps from Codex or Claude hooks.
- Do not let a parser-heavy cross-tool architecture drive v0.
- Do not auto-commit, auto-PR, or mutate user code from the supervisor.
- Do not trust compacted transcript summaries over `.agent` state, handoff files, and git state.

## Plan Corrections Applied

- Codex `StopFailure` support was removed from v0 assumptions. Cooldown failure handling is supervisor-owned for Codex.
- Codex context continuation now uses `codex fork` for child sessions; same-session cooldown resume uses `codex resume` or `codex exec resume`.
- Codex hooks in v0 are restricted to supported command handlers.
- Codex hook acceptance criteria now name only `SessionStart`, `Stop`, `PreCompact`, and `PostCompact`.
- Claude Code support remains a skeleton, but its documented `StopFailure`, `--fork-session`, `--resume`, and `--continue` paths are recorded for Phase 8.
- `block_auto_compact` means handoff-before-continuation policy, not a provider compaction bypass. If compaction cannot be prevented, `PostCompact` records the risk and future sessions prefer `.agent` state over compacted summaries.
- Phase 1 may start after this document and `PLAN.md` are updated, reviewed, and verification passes.

## Phase 0 Acceptance Checklist

- [x] At least one cooldown or auto resume implementation has been inspected.
- [x] At least one handoff or continuation implementation has been inspected.
- [x] Codex CLI resume path has been verified.
- [x] Codex plugin, skill, and hook capabilities have been verified.
- [x] Claude Code resume and lifecycle capabilities have been verified.
- [x] Borrowable designs are listed.
- [x] Rejected designs are listed.
- [x] `PLAN.md` has been adjusted if needed.

## Sources

- OpenAI Codex CLI manual, fetched with the local official-docs helper.
- OpenAI Codex CLI local help: `codex --help`, `codex resume --help`, `codex exec --help`, `codex exec resume --help`, `codex plugin --help`.
- OpenAI Codex docs: `https://developers.openai.com/codex/cli/reference`, `https://developers.openai.com/codex/cli/features`, `https://developers.openai.com/codex/skills`, `https://developers.openai.com/codex/plugins/build`, `https://developers.openai.com/codex/hooks`.
- Claude Code local help: `claude --help`.
- Claude Code docs: `https://code.claude.com/docs/en/cli-reference`, `https://code.claude.com/docs/en/hooks`, `https://code.claude.com/docs/en/skills`.
- GitHub repos: `Maciek-roboblog/Claude-Code-Usage-Monitor`, `aqua5230/usage`, `yigitkonur/cli-continues`, `frankbria/ralph-claude-code`.
