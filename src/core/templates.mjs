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
