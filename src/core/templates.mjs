export function formatHandoff(state, timestamp) {
  return `# Handoff

## Task ID

${state.task_id}

## Provider

${state.provider}

## Current Session

${state.current_session_id ?? 'None.'}

## Parent Session

${state.parent_session_id ?? 'None.'}

## Status

Initialized. No implementation work has started for this task.

## Goal

Record the task goal here before starting long-running work.

## Current Stage

Initialized.

## What Changed

- Created durable \`.agent\` state files.

## Files Touched

- \`.agent/\`

## Important Decisions

- Durable state is the source of truth for continuation.

## Current Git State Summary

Initial mechanical snapshot was written to \`.agent/AUTO_SNAPSHOT.md\`.

## Tests Run

None.

## Test Result

Not run.

## Known Risks

- Handoff has not been filled for active implementation work yet.

## Unfinished Work

- Fill this handoff before context pressure or session continuation.

## Next Exact Steps

1. Update \`.agent/NEXT.md\` with the next action.

## Do Not Redo

- Do not overwrite existing \`.agent\` state without explicit confirmation.

## Last Updated

${timestamp}
`;
}

export function formatContextHandoff({
  state,
  timestamp,
  trigger,
  branch,
  gitStatus,
  gitDiffStat,
  nextAction,
}) {
  return `# Handoff

## Task ID

${state.task_id}

## Provider

${state.provider}

## Current Session

${state.current_session_id ?? 'None.'}

## Parent Session

${state.parent_session_id ?? 'None.'}

## Status

Context handoff written before continuation.

## Goal

Continue the active task from durable \`.agent\` state.

## Current Stage

Context handoff.

## What Changed

- Recorded context pressure trigger: ${trigger}.
- Wrote durable handoff before starting any child continuation session.
- Captured current git status and diff stat.

## Files Touched

${formatListFromBlock(gitStatus)}

## Important Decisions

- Durable \`.agent\` state and git state are the source of truth for continuation.
- Child continuation must run recovery checks before editing.

## Current Git State Summary

branch: ${branch}

git status:
${indentBlock(gitStatus)}

git diff stat:
${indentBlock(gitDiffStat)}

## Tests Run

Not run by context handoff writer.

## Test Result

Not run.

## Known Risks

- Generated handoff may need more task-specific detail from the active session.

## Unfinished Work

- ${nextAction ?? 'Read .agent/NEXT.md and continue from the recorded next action.'}

## Next Exact Steps

1. Read \`.agent/HANDOFF.md\`.
2. Run \`git status --short\`.
3. Run \`git diff --no-color\`.
4. Continue from \`.agent/NEXT.md\`.

## Do Not Redo

- Do not redo completed work recorded in durable state.
- Do not use plain resume when a child continuation thread is required.

## Last Updated

${timestamp}
`;
}

export function formatNext() {
  return `# Next

## Next Action

Define the next action for this task.

## Target Files

- \`.agent/HANDOFF.md\`
- \`.agent/NEXT.md\`

## Constraints

- Do not overwrite existing \`.agent\` state without explicit confirmation.
- Read git status and git diff before editing project files.

## First Command To Inspect

\`\`\`sh
git status --short
\`\`\`

## Stop Condition

Stop if durable state and git state disagree.
`;
}

export function formatDecisions(timestamp) {
  return `# Decisions

No decisions recorded yet.

## Template

### Decision

Decision:
Reason:
Date: ${timestamp}
Related files:
Consequence:
`;
}

export function formatSnapshot({ timestamp, branch, gitStatus, gitDiffStat, state }) {
  return `# Auto Snapshot

timestamp: ${timestamp}
branch: ${branch}
git status:
${indentBlock(gitStatus)}
git diff stat:
${indentBlock(gitDiffStat)}
provider: ${state.provider}
session id: ${state.current_session_id ?? 'none'}
parent session id: ${state.parent_session_id ?? 'none'}
last event: ${state.last_event}
error reason if any: ${state.cooldown_reason ?? 'none'}
`;
}

function indentBlock(value) {
  return String(value)
    .split('\n')
    .map((line) => `  ${line}`)
    .join('\n');
}

function formatListFromBlock(value) {
  const lines = String(value)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0 || (lines.length === 1 && lines[0] === 'clean')) {
    return '- None.';
  }

  return lines.map((line) => `- \`${line}\``).join('\n');
}
