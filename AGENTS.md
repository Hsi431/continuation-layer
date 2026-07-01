# AGENTS.md — Behavioral Acceptance Rules

## Core Principle

Do not confuse components with completed behavior.

A feature is not complete because it has files, commands, tests, docs, state, or metadata.

A feature is complete only when the user-facing scenario that motivated it can run end-to-end.

If the original request describes an automatic workflow, the implementation must prove the automation actually happens without requiring hidden manual steps.

---

## Failure From Previous Iteration

This project previously implemented cooldown state management but failed to implement the actual cooldown watchdog behavior.

The intended behavior was:

```text
Codex hits a cooldown wall
→ the task pauses
→ the supervisor waits until reset
→ the supervisor automatically resumes the same session
→ the task continues
```

The implemented behavior was only:

```text
Codex hits a cooldown wall
→ state becomes cooling_down
→ next_resume_at is recorded
→ the process exits
→ the user must manually run resume later
```

This is not equivalent.

Recording a resumable state is not the same as automatically resuming.

Do not repeat this class of mistake.

---

## Behavioral Acceptance Rule

For every core feature, define the accident scenario before implementation.

Use this format:

```text
When <real failure or user event happens>,
the system must <observable behavior>,
without requiring <manual action that the product claims to remove>.
```

Example:

```text
When Codex hits a cooldown while running under continuity watch,
the supervisor must remain alive, wait until next_resume_at, and automatically resume the same session,
without requiring the user to manually run continuity resume.
```

If this sentence is not proven by tests or dogfood, the feature is not complete.

---

## Scenario Tests Are Required

Every headline feature must have at least one scenario test.

Unit tests for helper functions are not enough.

For watchdog behavior, the required test is:

```text
Given continuity watch is running,
when a fake provider returns a cooldown error,
then the watchdog records cooling_down state,
does not finish as a successful completed workflow,
waits until next_resume_at using a fake timer,
and automatically invokes same-session resume.
```

Additional required cases:

```text
- If provider gives an explicit reset timestamp, use it.
- If provider gives a relative reset duration, use it.
- If provider gives no reset time but usage_window_started_at exists, estimate from usage_window_started_at + 5h + buffer.
- If no usage window anchor exists, fall back to cooldown_detected_at + 5h + buffer and mark provenance as conservative fallback.
- If max resume count is exceeded, stop safely.
- If Ctrl-C is received, preserve state and do not mark the task as failed.
```

A feature is not accepted until the scenario test proves the actual user-facing behavior.

---

## Automation Must Be Real

Do not describe a manual workflow as automatic.

These are different:

```text
Manual:
detect cooldown → write next_resume_at → user later runs resume

Automatic:
detect cooldown → wait → resume without user intervention
```

If a command exits and requires the user to run another command, it is not an automatic watchdog.

Docs, README, CLI help, and tests must use the same language as the actual behavior.

---

## Do Not Let README Drive Truth

README can explain behavior, but it cannot define reality.

Before claiming a feature is complete, inspect the implementation and tests.

Do not accept claims such as:

```text
- supervisor waits and resumes
- auto continuation
- guarded recovery
- cooldown watchdog
```

unless code and tests prove the exact behavior.

---

## Component Checklist Is Not Acceptance

The following do not prove the feature is complete:

```text
- There is a supervisor file.
- There is a state machine.
- There is next_resume_at.
- There is a resume command.
- There is a README section.
- There are unit tests.
- CI is green.
- The package metadata is polished.
```

These are only components.

Acceptance requires proving the end-to-end behavior that the user cares about.

---

## Always Ask: Is the Loop Closed?

For each feature, answer these questions before marking done:

```text
1. What real-world failure is this feature supposed to handle?
2. What exact command is the user expected to run?
3. After the failure happens, does the process keep running or exit?
4. Does the user need to manually run another command?
5. If the product claims automation, where is the loop that performs it?
6. Is there a test proving the loop closes?
7. Does README describe the same behavior the code actually implements?
```

If any answer is unclear, stop and report before continuing.

---

## Source of Truth

For runtime recovery features, the source of truth must be:

```text
1. actual process behavior
2. durable state files
3. git status / git diff
4. scenario tests
5. README
```

README is last, not first.

Do not infer completion from documentation.

---

## Cooldown Watchdog Requirements

For this project, cooldown handling is not complete unless all of the following are true:

```text
- A long-running command exists, such as continuity watch.
- The command starts the provider process.
- When cooldown is detected, the command does not merely exit.
- It records cooldown metadata.
- It records reset-time provenance.
- It waits until next_resume_at.
- It automatically resumes the same session.
- It repeats safely if another cooldown occurs.
- It has circuit breakers.
- It handles Ctrl-C gracefully.
- It has tests using fake provider output and fake timers.
```

If only `cooling_down` state and manual `resume` exist, the watchdog is incomplete.

---

## Handoff Requirements

Do not assume semantic handoff can be written after a provider rejects requests.

Cooldown recovery may rely on:

```text
- the latest existing handoff
- mechanical snapshot
- git status
- git diff
- provider logs
```

If no fresh semantic handoff exists, say so.

Do not pretend a handoff was created after cooldown unless the code actually created one before the provider stopped accepting work.

---

## Reset-Time Calculation Requirements

Do not blindly calculate reset as:

```text
cooldown_detected_at + 5h
```

Use this priority:

```text
1. provider explicit reset timestamp
2. provider relative reset duration
3. usage_window_started_at + 5h + buffer
4. cooldown_detected_at + 5h + buffer as conservative fallback
```

Always record reset-time provenance.

If the fallback is conservative, label it clearly.

---

## Direct Provider Runs Are Invisible

If the user runs `codex` directly, Continuation Layer cannot observe the process.

The docs and CLI must state this clearly.

Only provider processes launched through Continuation Layer can be monitored, logged, waited on, and resumed automatically.

---

## Release Gate

Do not mark a release as ready if the main product promise has not been proven by scenario tests.

For v0.1, release is blocked unless this scenario passes:

```text
continuity watch "task"
→ fake provider returns cooldown
→ watchdog records cooling_down
→ watchdog waits using fake timer
→ watchdog automatically invokes same-session resume
→ state is updated correctly
```

A polished README, clean CI, package metadata, and release notes do not override a failed core scenario.

---

## Review Discipline

When reviewing agent-generated work:

```text
- Review behavior before structure.
- Review scenario tests before unit tests.
- Review runtime flow before README.
- Review automation claims before release claims.
- Reject “looks implemented” if the user-facing loop is not closed.
```

If a feature exists only as disconnected pieces, do not call it complete.

Call it partial infrastructure.

---

## Required Completion Report

When finishing a task, report in this format:

```text
1. Original user-facing scenario:
2. Implemented behavior:
3. Exact command to trigger it:
4. What happens on failure:
5. Whether the process exits or keeps running:
6. Manual steps still required:
7. Scenario tests added:
8. Remaining gaps:
```

If “manual steps still required” contradicts the original product promise, the task is not complete.
