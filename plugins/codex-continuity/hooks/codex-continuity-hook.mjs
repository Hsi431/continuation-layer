#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AGENT_DIR = '.agent';
const CONFIG_FILE = 'config.json';
const STATE_FILE = 'state.json';
const HANDOFF_FILE = 'HANDOFF.md';
const NEXT_FILE = 'NEXT.md';
const DECISIONS_FILE = 'DECISIONS.md';
const SNAPSHOT_FILE = 'AUTO_SNAPSHOT.md';
const SESSIONS_FILE = 'sessions.jsonl';

if (isMain()) {
  const stdinText = await readStdinWithDeadline();
  const output = runHookCli(process.argv.slice(2), process.env, stdinText);
  if (output) {
    process.stdout.write(output);
  }
}

export function runHookCli(argv, env = process.env, stdinText = '') {
  try {
    const { command, cwd, trigger } = parseInvocation(argv, env, stdinText);
    const repoRoot = resolveHookRepoRoot(cwd, env);
    return runHook(command, repoRoot, trigger);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[continuity] hook skipped: ${message}`);
    return '';
  }
}

function runHook(command, repoRoot, trigger) {
  if (command === 'session-start') {
    return sessionStartContext(buildContinuityContext(repoRoot, `codex SessionStart ${trigger}`));
  }

  if (command === 'stop') {
    const result = writeMechanicalSnapshot(repoRoot, 'codex Stop hook');
    return systemMessage(`continuity snapshot written: ${result.snapshotPath}`);
  }

  if (command === 'pre-compact') {
    recordContextPressure(repoRoot, trigger);
    return systemMessage(
      'continuity handoff requested before compaction; do not bypass provider compaction',
    );
  }

  if (command === 'post-compact') {
    recordCompaction(repoRoot, trigger);
    return systemMessage('continuity compaction recorded; prefer .agent durable state');
  }

  throw new Error(`unknown hook command: ${command}`);
}

function parseInvocation(argv, env, stdinText) {
  const [command = 'help', ...args] = argv;
  const options = {
    command,
    cwd: null,
    trigger: 'unknown',
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--cwd') {
      options.cwd = args[index + 1] ? resolve(args[index + 1]) : null;
      index += 1;
    } else if (arg === '--trigger') {
      options.trigger = args[index + 1] ?? 'unknown';
      index += 1;
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }

  const payload = parsePayload(stdinText) ?? parsePayload(env.CONTINUITY_HOOK_PAYLOAD) ?? {};
  options.cwd ??=
    payload.cwd ??
    payload.working_directory ??
    payload.workspace?.cwd ??
    payload.project?.path ??
    null;
  options.trigger = options.trigger === 'unknown' ? hookTrigger(payload) : options.trigger;
  return options;
}

function parsePayload(text) {
  const value = String(text ?? '').trim();
  if (!value) {
    return null;
  }

  return JSON.parse(value);
}

function resolveHookRepoRoot(explicitCwd, env) {
  const candidates = [
    explicitCwd,
    env.CONTINUITY_REPO,
    env.INIT_CWD,
    env.PWD,
    process.cwd(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const repoRoot = tryResolveRepoRoot(candidate);
    if (repoRoot && existsSync(agentPath(repoRoot, STATE_FILE))) {
      return repoRoot;
    }
  }

  throw new Error('no initialized .agent state found for hook cwd');
}

function writeMechanicalSnapshot(repoRoot, reason) {
  const timestamp = nowIso();
  const { state } = loadAgentState(repoRoot);
  const nextState = {
    ...state,
    last_event: 'checkpoint_written',
    updated_at: timestamp,
  };

  writeSnapshotForState(repoRoot, nextState, timestamp);
  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, 'checkpoint_written', reason, timestamp);

  return {
    state: nextState,
    snapshotPath: agentPath(repoRoot, SNAPSHOT_FILE),
  };
}

function recordContextPressure(repoRoot, trigger) {
  const timestamp = nowIso();
  const pressureState = transitionState(
    repoRoot,
    {
      status: 'waiting_for_user',
      mode: 'context_handoff',
    },
    'context_pressure_detected',
    `pre-compact hook: ${trigger}`,
    timestamp,
  );
  const nextState = writeContextHandoffForState(
    repoRoot,
    pressureState,
    `pre-compact hook: ${trigger}`,
    timestamp,
  );

  writeSnapshotForState(repoRoot, nextState, timestamp);
}

function recordCompaction(repoRoot, trigger) {
  const timestamp = nowIso();
  const nextState = transitionState(
    repoRoot,
    {
      mode: 'context_handoff',
    },
    'compaction_recorded',
    `post-compact hook: ${trigger}; prefer .agent durable state`,
    timestamp,
  );

  writeSnapshotForState(repoRoot, nextState, timestamp);
}

function transitionState(repoRoot, changes, event, reason, timestamp) {
  const { state } = loadAgentState(repoRoot);
  const nextState = {
    ...state,
    ...changes,
    last_event: event,
    updated_at: timestamp,
  };

  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, event, reason, timestamp);
  return nextState;
}

function buildContinuityContext(repoRoot, source) {
  const { state } = loadAgentState(repoRoot);
  const nextAction = readNextAction(agentPath(repoRoot, NEXT_FILE));

  return [
    '# Continuity Context',
    '',
    `source: ${source}`,
    `task id: ${state.task_id}`,
    `provider: ${state.provider}`,
    `status: ${state.status}`,
    `mode: ${state.mode}`,
    `current session: ${state.current_session_id ?? 'none'}`,
    `parent session: ${state.parent_session_id ?? 'none'}`,
    `handoff: ${state.current_handoff_path}`,
    `snapshot: ${state.last_snapshot_path}`,
    `last event: ${state.last_event}`,
    `next action: ${nextAction ?? 'none'}`,
    '',
    'Read .agent/HANDOFF.md, .agent/NEXT.md, .agent/DECISIONS.md, git status, and git diff before editing.',
    'Prefer .agent durable state over compacted transcript summaries.',
  ].join('\n');
}

function loadAgentState(repoRoot) {
  const config = readJsonFile(agentPath(repoRoot, CONFIG_FILE));
  const state = readJsonFile(agentPath(repoRoot, STATE_FILE));

  for (const key of ['provider', 'overnight_mode', 'auto_continue_after_handoff']) {
    if (config[key] !== state[key]) {
      throw new Error(`Config/state mismatch: ${key}`);
    }
  }

  return { config, state };
}

function writeSnapshotForState(repoRoot, state, timestamp) {
  const git = readGitSnapshot(repoRoot);
  writeTextFile(
    agentPath(repoRoot, SNAPSHOT_FILE),
    formatSnapshot({
      timestamp,
      branch: git.branch,
      gitStatus: git.status,
      gitDiffStat: git.diffStat,
      state,
    }),
  );
}

function readGitSnapshot(repoRoot) {
  return {
    branch: runGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD']) || 'unknown',
    status: runGit(repoRoot, ['status', '--short']) || '(clean)',
    diffStat: runGit(repoRoot, ['diff', '--stat']) || '(no diff)',
  };
}

function writeContextHandoffForState(repoRoot, state, trigger, timestamp) {
  const git = readGitSnapshot(repoRoot);
  const nextAction = readNextAction(agentPath(repoRoot, NEXT_FILE));
  const nextState = {
    ...state,
    last_event: 'handoff_written',
    updated_at: timestamp,
  };

  saveState(repoRoot, nextState);
  appendEvent(repoRoot, nextState, 'handoff_written', trigger, timestamp);
  writeTextFile(
    agentPath(repoRoot, HANDOFF_FILE),
    formatContextHandoff({
      state: nextState,
      timestamp,
      trigger,
      branch: git.branch,
      gitStatus: git.status,
      gitDiffStat: git.diffStat,
      nextAction,
    }),
  );

  return nextState;
}

function formatSnapshot({ timestamp, branch, gitStatus, gitDiffStat, state }) {
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

function formatContextHandoff({
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

function appendEvent(repoRoot, state, event, reason, timestamp) {
  appendJsonLine(agentPath(repoRoot, SESSIONS_FILE), {
    timestamp,
    task_id: state.task_id,
    provider: state.provider,
    session_id: state.current_session_id,
    parent_session_id: state.parent_session_id,
    event,
    handoff_path: state.current_handoff_path,
    reason,
  });
}

function readNextAction(path) {
  if (!existsSync(path)) {
    return null;
  }

  const text = readFileSync(path, 'utf8');
  const match = text.match(/## Next Action\s+([\s\S]*?)(?:\n## |\s*$)/);
  return match ? match[1].trim() : null;
}

function tryResolveRepoRoot(path) {
  try {
    return runGit(path, ['rev-parse', '--show-toplevel']);
  } catch {
    return null;
  }
}

function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

function readJsonFile(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function saveState(repoRoot, state) {
  writeJsonFile(agentPath(repoRoot, STATE_FILE), state);
}

function writeJsonFile(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function writeTextFile(path, text) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}

function appendJsonLine(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(value)}\n`, { flag: 'a' });
}

function agentPath(repoRoot, ...parts) {
  return join(repoRoot, AGENT_DIR, ...parts);
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

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '(clean)')) {
    return '- None.';
  }

  return lines.map((line) => `- \`${line}\``).join('\n');
}

function systemMessage(text) {
  return `${JSON.stringify({ systemMessage: text })}\n`;
}

function sessionStartContext(text) {
  return `${JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: text,
    },
  })}\n`;
}

function hookTrigger(payload) {
  return payload.matcher ?? payload.trigger ?? payload.source ?? payload.event ?? 'unknown';
}

function nowIso() {
  return new Date().toISOString();
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
}

function readStdinWithDeadline(timeoutMs = 100) {
  if (process.stdin.isTTY) {
    return Promise.resolve('');
  }

  return new Promise((resolveText) => {
    let text = '';
    let done = false;
    const finish = () => {
      if (done) {
        return;
      }

      done = true;
      clearTimeout(timer);
      process.stdin.off('data', onData);
      process.stdin.off('end', finish);
      process.stdin.off('error', finish);
      process.stdin.pause();
      resolveText(text);
    };
    const onData = (chunk) => {
      text += chunk;
    };
    const timer = setTimeout(finish, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    process.stdin.resume();
  });
}
